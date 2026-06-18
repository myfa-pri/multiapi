import admin from 'firebase-admin';
import axios from 'axios';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        }),
    });
}
const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { bot_hash, user_id, device_id, bot_id } = req.body;

    if (!bot_hash || !user_id || !device_id || !bot_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // 1. Unique device key formatted as "bot_id:device_id"
        const deviceDocId = `${bot_id}_${device_id}`;
        const deviceDocRef = db.collection('devices').doc(deviceDocId);
        const deviceSnap = await deviceDocRef.get();

        // 2. Fetch the corresponding webhook
        const webhookDocRef = db.collection('webhooks').doc(bot_hash);
        const webhookSnap = await webhookDocRef.get();
        const webhookUrl = webhookSnap.exists ? webhookSnap.data().webhook_url : null;

        // --- SCENARIO 1: USER IS ALREADY VERIFIED ---
        if (deviceSnap.exists) {
            const existingUserId = deviceSnap.data().user_id;

            if (String(existingUserId) === String(user_id)) {
                // Update timestamp to keep the active user tracked
                await deviceDocRef.update({
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                if (webhookUrl) {
                    await axios.post(webhookUrl, { 
                        status: "info", 
                        title: "Already Verified", 
                        message: `Your device is already verified for ${bot_id}.` 
                    });
                    await webhookDocRef.delete(); 
                }

                return res.status(200).json({ success: true, message: "Already verified" });
            } else {
                // --- SCENARIO 2: MULTI-ACCOUNT DETECTED (BAN) ---
                if (webhookUrl) {
                    await axios.post(webhookUrl, { 
                        status: "error", 
                        title: "Verification Failed", 
                        message: "Multiple accounts detected on the same physical device for this specific bot." 
                    });
                    await webhookDocRef.delete(); 
                }
                return res.status(200).json({ success: false, error: "Multiple accounts detected. Verification failed." });
            }
        }

        // --- SCENARIO 3: BRAND NEW VERIFICATION ---
        if (!deviceSnap.exists) {
            if (!webhookUrl) {
                return res.status(400).json({ error: 'Verification link expired. Send /start in the bot to get a new one.' });
            }

            // Register device
            await deviceDocRef.set({
                user_id: String(user_id),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger the success webhook payload to the bot
            await axios.post(webhookUrl, { 
                status: "success", 
                title: "Verified Successfully", 
                message: "Your device has been successfully verified." 
            });

            // Clean up the used hash webhook doc
            await webhookDocRef.delete();

            return res.status(200).json({ success: true });
        }

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: 'Server connection error.' });
    }
}
