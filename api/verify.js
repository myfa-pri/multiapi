import { kv } from '@vercel/kv';
import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { bot_hash, user_id, device_id } = req.body;

    if (!bot_hash || !user_id || !device_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        // 1. Get webhook URL that your bot registered
        const webhookUrl = await kv.get(`hash:${bot_hash}`);
        if (!webhookUrl) {
            return res.status(400).json({ error: 'Verification link expired. Send /start again.' });
        }

        // 2. Check if this exact device has been verified before
        const existingUserId = await kv.get(`device:${device_id}`);

        let status = "", title = "", message = "";

        if (existingUserId) {
            if (String(existingUserId) === String(user_id)) {
                // Same phone, same account -> ALREADY VERIFIED
                status = "info";
                title = "Already Verified";
                message = "Your device is already verified and secure.";
            } else {
                // Same phone, DIFFERENT account -> MULTI-ACCOUNT DETECTED!
                status = "error";
                title = "Verification Failed";
                message = "Multiple accounts detected on the same physical device. This violates our security policy.";
            }
        } else {
            // New Phone -> REGISTER NEW DEVICE
            await kv.set(`device:${device_id}`, String(user_id));
            status = "success";
            title = "Verified Successfully";
            message = "Your device has been successfully verified.";
        }

        // 3. Send the result back to your Telegram Bot Webhook
        await axios.post(webhookUrl, { status, title, message });

        // 4. Tell the Web App everything is done
        res.status(200).json({ success: true });

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: 'Server connection error.' });
    }
}
