import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('trakteer_donations');

    // GET: Ambil channel ID (untuk konfigurasi frontend) atau daftar riwayat donasi
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

    // POST: Simpan donasi baru dari Trakteer WebSocket / Webhook
    if (req.method === 'POST') {
      const { supporter_name, unit, quantity, supporter_message, supporter_avatar, unit_icon, price } = req.body;

      if (!supporter_name) {
        return res.status(400).json({ success: false, message: 'Nama supporter tidak boleh kosong.' });
      }

      const newDonation = {
        supporter_name,
        unit: unit || 'Dukungan',
        quantity: quantity || 1,
        supporter_message: supporter_message || '',
        supporter_avatar: supporter_avatar || 'https://edge-cdn.trakteer.id/images/mix/default-avatar.png',
        unit_icon: unit_icon || '',
        price: price || 'Rp 0',
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
