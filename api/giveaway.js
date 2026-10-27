// api/giveaway.js
import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

const OWNER_ID = '628205121704296458';

export default async function handler(req, res) {
  // Atur header respon agar selalu mengirimkan JSON
  res.setHeader('Content-Type', 'application/json');

  // Helper untuk parsing body secara aman di Vercel Serverless
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  try {
    const { db } = await connectToDatabase();
    const giveawaysCol = db.collection('giveaways');

    // 1. GET: Ambil daftar seluruh giveaway
    if (req.method === 'GET') {
      const giveaways = await giveawaysCol.find({}).sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ success: true, data: giveaways });
    }

    // 2. POST: Buat Giveaway Baru (Khusus Owner)
    if (req.method === 'POST') {
      const { title, description, prize, winnersCount, userId } = body;

      if (!userId || userId !== OWNER_ID) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Hanya owner yang dapat membuat giveaway!' });
      }

      if (!title || !prize) {
        return res.status(400).json({ success: false, error: 'Judul dan hadiah wajib diisi!' });
      }

      const newGiveaway = {
        title,
        description: description || '',
        prize,
        winnersCount: parseInt(winnersCount) || 1,
        participants: [],
        winners: [],
        status: 'active',
        createdAt: new Date(),
        createdBy: userId
      };

      const result = await giveawaysCol.insertOne(newGiveaway);
      return res.status(200).json({ success: true, message: 'Giveaway berhasil tersimpan ke MongoDB!', data: { ...newGiveaway, _id: result.insertedId } });
    }

    // 3. PUT: Mengikuti Giveaway atau Roll Start Pemenang
    if (req.method === 'PUT') {
      const { action, giveawayId, user, userId } = body;

      if (!giveawayId) {
        return res.status(400).json({ success: false, error: 'ID Giveaway tidak valid!' });
      }

      // A. User Masuk / Ikut Giveaway
      if (action === 'join') {
        if (!user || !user.id) {
          return res.status(401).json({ success: false, error: 'Silakan login dengan Discord terlebih dahulu!' });
        }

        const giveaway = await giveawaysCol.findOne({ _id: new ObjectId(giveawayId) });
        if (!giveaway) return res.status(404).json({ success: false, error: 'Giveaway tidak ditemukan!' });
        if (giveaway.status === 'ended') return res.status(400).json({ success: false, error: 'Giveaway ini sudah berakhir!' });

        const alreadyJoined = giveaway.participants.some(p => p.id === user.id);
        if (alreadyJoined) {
          return res.status(400).json({ success: false, error: 'Anda sudah mendaftar pada giveaway ini!' });
        }

        await giveawaysCol.updateOne(
          { _id: new ObjectId(giveawayId) },
          { $push: { participants: { id: user.id, username: user.username, global_name: user.global_name, avatar: user.avatar } } }
        );

        return res.status(200).json({ success: true, message: 'Berhasil mendaftar giveaway!' });
      }

      // B. Roll Start Pemenang (Khusus Owner)
      if (action === 'roll') {
        if (!userId || userId !== OWNER_ID) {
          return res.status(403).json({ success: false, error: 'Hanya owner yang dapat mengocok pemenang!' });
        }

        const giveaway = await giveawaysCol.findOne({ _id: new ObjectId(giveawayId) });
        if (!giveaway) return res.status(404).json({ success: false, error: 'Giveaway tidak ditemukan!' });
        if (!giveaway.participants || giveaway.participants.length === 0) {
          return res.status(400).json({ success: false, error: 'Tidak ada peserta untuk dikocok!' });
        }

        const shuffled = [...giveaway.participants].sort(() => 0.5 - Math.random());
        const selectedWinners = shuffled.slice(0, Math.min(giveaway.winnersCount, giveaway.participants.length));

        await giveawaysCol.updateOne(
          { _id: new ObjectId(giveawayId) },
          { $set: { winners: selectedWinners, status: 'ended' } }
        );

        return res.status(200).json({ success: true, message: 'Pemenang berhasil dikocok!', winners: selectedWinners });
      }
    }

    // 4. DELETE: Hapus Giveaway (Khusus Owner)
    if (req.method === 'DELETE') {
      const { giveawayId, userId } = body;

      if (!userId || userId !== OWNER_ID) {
        return res.status(403).json({ success: false, error: 'Hanya owner yang dapat menghapus giveaway!' });
      }

      await giveawaysCol.deleteOne({ _id: new ObjectId(giveawayId) });
      return res.status(200).json({ success: true, message: 'Giveaway berhasil dihapus!' });
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  } catch (error) {
    console.error("API Giveaway Error:", error);
    return res.status(500).json({ success: false, error: error.message || 'Terjadi kesalahan pada server.' });
  }
}
