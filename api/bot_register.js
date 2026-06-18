import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Allow CORS so the web app can communicate easily
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { botHash, webhook_url } = req.query;

    if (!botHash || !webhook_url) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    // SAVED PERMANENTLY: No expiration timer!
    // The link will stay valid for as long as it takes the user to click it.
    await kv.set(`h:${botHash}`, webhook_url);

    res.status(200).json({ status: 'ok', botHash });
}
