import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Allows CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { botHash, webhook_url } = req.query;

    if (!botHash || !webhook_url) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    // Save the webhook mapped to the unique botHash. Expires in 1 hour (3600 seconds)
    await kv.set(`hash:${botHash}`, webhook_url, { ex: 3600 });

    res.status(200).json({ status: 'ok', botHash });
}
