import admin from 'firebase-admin';

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { botHash, webhook_url } = req.query;

    if (!botHash || !webhook_url) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // Save webhook URL in the "webhooks" collection
        await db.collection('webhooks').doc(botHash).set({
            webhook_url,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ status: 'ok', botHash });
    } catch (error) {
        console.error("Firebase Error:", error);
        res.status(500).json({ error: 'Database connection error' });
    }
}
