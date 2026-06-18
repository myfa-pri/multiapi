import { kv } from '@vercel/kv';
import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { bot_hash, user_id, device_id, bot_id } = req.body;

    if (!bot_hash || !user_id || !device_id || !bot_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // 1. Check the database for the Device FIRST
        const deviceKey = `d:${bot_id}:${device_id}`;
        const existingUserId = await kv.get(deviceKey);
        
        // 2. Get the webhook URL (it might be null if they clicked an old button)
        const webhookUrl = await kv.get(`h:${bot_hash}`);

        // --- SCENARIO 1: USER IS ALREADY VERIFIED ---
        if (existingUserId && String(existingUserId) === String(user_id)) {
            // Refresh their 90-day timer since they are active
            await kv.expire(deviceKey, 7776000); 
            
            // If they clicked a NEW link, tell the bot. 
            if (webhookUrl) {
                await axios.post(webhookUrl, { 
                    status: "info", 
                    title: "Already Verified", 
                    message: `Your device is already verified for ${bot_id}.` 
                });
                await kv.del(`h:${bot_hash}`); // Clean up
            }
            
            // Instantly tell the Web App everything is fine!
            return res.status(200).json({ success: true, message: "Already verified" });
        }

        // --- SCENARIO 2: MULTI-ACCOUNT DETECTED (BAN) ---
        if (existingUserId && String(existingUserId) !== String(user_id)) {
            if (webhookUrl) {
                await axios.post(webhookUrl, { 
                    status: "error", 
                    title: "Verification Failed", 
                    message: "Multiple accounts detected on the same physical device for this specific bot." 
                });
                await kv.del(`h:${bot_hash}`); // Clean up
            }
            // Block them on the web app side too
            return res.status(200).json({ success: false, error: "Multiple accounts detected. Verification failed." });
        }

        // --- SCENARIO 3: BRAND NEW VERIFICATION ---
        if (!existingUserId) {
            // If they are brand new, they MUST have a valid link. If not, they are clicking an old dead button.
            if (!webhookUrl) {
                return res.status(400).json({ error: 'Verification link expired. Send /start in the bot to get a new one.' });
            }

            // Register the new device for 90 days
            await kv.set(deviceKey, String(user_id), { ex: 7776000 });
            
            // Tell the bot they passed
            await axios.post(webhookUrl, { 
                status: "success", 
                title: "Verified Successfully", 
                message: "Your device has been successfully verified." 
            });
            
            // Delete the temporary webhook link to save database space
            await kv.del(`h:${bot_hash}`);

            return res.status(200).json({ success: true });
        }

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: 'Server connection error.' });
    }
}
