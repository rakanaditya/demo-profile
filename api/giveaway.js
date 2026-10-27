// api/giveaway.js
import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

const OWNER_ID = '628205121704296458'; // ID Pengelola Utama (Rakan Aditya)

export default async function handler(req, res) {
  const { method } = req;
  const { db } = await connectToDatabase();
  const giveawaysCol = db.collection('giveaways');

  try {
    // 1. GET: Ambil daftar seluruh giveaway
    if (method === 'GET') {
      const giveaways = await giveawaysCol.find({}).sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ success: true, data: giveaways });
    }

    // 2. POST: Buat Giveaway Baru (Khusus Owner)
    if (method === 'POST') {
      const { title, description, prize, winnersCount, userId } = req.body;

      if (userId !== OWNER_ID) {
        return res.status(403).json({ error: 'Akses ditolak. Hanya owner yang dapat membuat giveaway!' });
      }

      if (!title || !prize) {
        return res.status(400).json({ error: 'Judul dan hadiah wajib diisi!' });
      }

      const newGiveaway = {
        title,
        description: description || '',
        prize,
        winnersCount: parseInt(winnersCount) || 1,
        participants: [], // Array ID & username peserta
        winners: [],
        status: 'active', // active / ended
        createdAt: new Date(),
        createdBy: userId
      };

      const result = await giveawaysCol.insertOne(newGiveaway);
      return res.status(201).json({ success: true, data: { ...newGiveaway, _id: result.insertedId } });
    }

    // 3. PUT: Mengikuti Giveaway atau Roll Start Pemenang
    if (method === 'PUT') {
      const { action, giveawayId, user } = req.body;

      if (!giveawayId) {
        return res.status(400).json({ error: 'ID Giveaway tidak valid!' });
      }

      // A. User Masuk / Ikut Giveaway
      if (action === 'join') {
        if (!user || !user.id) {
          return res.status(401).json({ error: 'Silakan login dengan Discord terlebih dahulu!' });
        }

        const giveaway = await giveawaysCol.findOne({ _id: new ObjectId(giveawayId) });
        if (!giveaway) return res.status(404).json({ error: 'Giveaway tidak ditemukan!' });
        if (giveaway.status === 'ended') return res.status(400).json({ error: 'Giveaway ini sudah berakhir!' });

        const alreadyJoined = giveaway.participants.some(p => p.id === user.id);
        if (alreadyJoined) {
          return res.status(400).json({ error: 'Anda sudah mendaftar pada giveaway ini!' });
        }

        await giveawaysCol.updateOne(
          { _id: new ObjectId(giveawayId) },
          { $push: { participants: { id: user.id, username: user.username, global_name: user.global_name, avatar: user.avatar } } }
        );

        return res.status(200).json({ success: true, message: 'Berhasil mendaftar giveaway!' });
      }

      // B. Roll Start Pemenang (Khusus Owner)
      if (action === 'roll') {
        const { userId } = req.body;
        if (userId !== OWNER_ID) {
          return res.status(403).json({ error: 'Hanya owner yang dapat mengocok pemenang!' });
        }

        const giveaway = await giveawaysCol.findOne({ _id: new ObjectId(giveawayId) });
        if (!giveaway) return res.status(404).json({ error: 'Giveaway tidak ditemukan!' });
        if (giveaway.participants.length === 0) {
          return res.status(400).json({ error: 'Tidak ada peserta untuk dikocok!' });
        }

        // Acak Peserta
        const shuffled = [...giveaway.participants].sort(() => 0.5 - Math.random());
        const selectedWinners = shuffled.slice(0, Math.min(giveaway.winnersCount, giveaway.participants.length));

        await giveawaysCol.updateOne(
          { _id: new ObjectId(giveawayId) },
          { $set: { winners: selectedWinners, status: 'ended' } }
        );

        return res.status(200).json({ success: true, winners: selectedWinners });
      }
    }

    // 4. DELETE: Hapus Giveaway (Khusus Owner)
    if (method === 'DELETE') {
      const { giveawayId, userId } = req.body;

      if (userId !== OWNER_ID) {
        return res.status(403).json({ error: 'Hanya owner yang dapat menghapus giveaway!' });
      }

      await giveawaysCol.deleteOne({ _id: new ObjectId(giveawayId) });
      return res.status(200).json({ success: true, message: 'Giveaway berhasil dihapus!' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
