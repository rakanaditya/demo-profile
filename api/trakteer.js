import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('trakteer_donations');

    // GET: Ambil konfigurasi channel atau daftar riwayat donasi
    if (req.method === 'GET') {
      const { action } = req.query;

      if (action === 'config') {
        return res.status(200).json({
          success: true,
          channelId: process.env.TRAKTEER_CHANNEL_ID || ''
        });
      }

      const donations = await collection.find({}).sort({ createdAt: -1 }).limit(20).toArray();
      return res.status(200).json({ success: true, donations });
    }

    // POST: Menerima data dari WebSocket frontend ATAU Webhook HTTP Trakteer
    if (req.method === 'POST') {
      const bodyData = req.body;

      // Mendukung struktur data dari WebSocket maupun Webhook HTTP Trakteer
      const supporter_name = bodyData.supporter_name || bodyData.name || 'Seseorang';
      const unit = bodyData.unit || 'Dukungan';
      const quantity = bodyData.quantity || bodyData.total_unit || 1;
      const supporter_message = bodyData.supporter_message || bodyData.message || '';
      const supporter_avatar = bodyData.supporter_avatar || bodyData.avatar || 'https://edge-cdn.trakteer.id/images/mix/default-avatar.png';
      const price = bodyData.price || bodyData.amount || 'Rp 0';

      const newDonation = {
        supporter_name,
        unit,
        quantity: Number(quantity),
        supporter_message,
        supporter_avatar,
        price: String(price),
        createdAt: new Date(),
      };

      await collection.insertOne(newDonation);
      return res.status(201).json({ success: true, message: 'Donasi berhasil disimpan!' });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('Trakteer API Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
