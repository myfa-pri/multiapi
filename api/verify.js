import { kv } from '@vercel/kv';
import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // We added bot_id here to know exactly WHICH bot is asking
    const { bot_hash, user_id, device_id, bot_id } = req.body;

    if (!bot_hash || !user_id || !device_id || !bot_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // 1. Get webhook URL 
        const webhookUrl = await kv.get(`h:${bot_hash}`);
        if (!webhookUrl) {
            return res.status(400).json({ error: 'Verification link expired. Send /start again.' });
        }

        // 2. Multi-Bot Isolation: Create a unique database key for THIS specific bot
        const deviceKey = `d:${bot_id}:${device_id}`;
        
        // Check if device exists FOR THIS BOT ONLY
        const existingUserId = await kv.get(deviceKey);

        let status = "", title = "", message = "";

        if (existingUserId) {
            if (String(existingUserId) === String(user_id)) {
                status = "info";
                title = "Already Verified";
                message = `Your device is already verified for ${bot_id}.`;
                
                // Refresh the 90-day timer (7,776,000 seconds)
                await kv.expire(deviceKey, 7776000);
            } else {
                status = "error";
                title = "Verification Failed";
                message = "Multiple accounts detected on the same physical device for this specific bot.";
            }
        } else {
            // New Phone -> REGISTER NEW DEVICE FOR THIS BOT with 90-DAY Auto-Delete
            await kv.set(deviceKey, String(user_id), { ex: 7776000 });
            status = "success";
            title = "Verified Successfully";
            message = "Your device has been successfully verified.";
        }

        // 3. Send result back to the specific Bot's webhook
        await axios.post(webhookUrl, { status, title, message });

        // 4. Delete the temporary webhook hash
        await kv.del(`h:${bot_hash}`);

        res.status(200).json({ success: true });

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: 'Server connection error.' });
    }
}
