// api/giveaway.js
import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

const OWNER_ID = '628205121704296458';

export default async function handler(req, res) {
  const { db } = await connectToDatabase();
  const collection = db.collection('giveaways');

  if (req.method === 'GET') {
    try {
      const giveaways = await collection.find({}).sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ success: true, data: giveaways });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Gagal mengambil data giveaway.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { title, prize, winnersCount, durationValue, durationUnit, description, userId } = req.body;

      if (userId !== OWNER_ID) {
        return res.status(403).json({ success: false, error: 'Hanya Owner yang dapat membuat giveaway.' });
      }

      let durationMs = parseInt(durationValue) * 60 * 1000;
      if (durationUnit === 'hours') durationMs = parseInt(durationValue) * 60 * 60 * 1000;
      if (durationUnit === 'days') durationMs = parseInt(durationValue) * 24 * 60 * 60 * 1000;
      if (durationUnit === 'weeks') durationMs = parseInt(durationValue) * 7 * 24 * 60 * 60 * 1000;

      const newGiveaway = {
        title,
        prize,
        winnersCount: parseInt(winnersCount) || 1,
        description,
        status: 'active',
        participants: [],
        winners: [],
        webhookWinnerSent: false,
        webhookAutoRollSent: false,
        webhookManualRollSent: false,
        createdAt: new Date(),
        endsAt: new Date(Date.now() + durationMs)
      };

      const result = await collection.insertOne(newGiveaway);
      newGiveaway._id = result.insertedId;

      return res.status(201).json({ success: true, message: 'Giveaway berhasil dibuat!', data: newGiveaway });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Gagal membuat giveaway.' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { action, giveawayId, user } = req.body;

      if (!giveawayId) {
        return res.status(400).json({ success: false, error: 'ID Giveaway wajib diisi.' });
      }

      const gwId = new ObjectId(giveawayId);
      const giveaway = await collection.findOne({ _id: gwId });

      if (!giveaway) {
        return res.status(404).json({ success: false, error: 'Giveaway tidak ditemukan.' });
      }

      if (action === 'join') {
        if (giveaway.status === 'ended') {
          return res.status(400).json({ success: false, error: 'Giveaway sudah berakhir.' });
        }

        const isAlreadyJoined = giveaway.participants.some(p => p.id === user.id);
        if (isAlreadyJoined) {
          return res.status(400).json({ success: false, error: 'Anda sudah mendaftar giveaway ini.' });
        }

        await collection.updateOne(
          { _id: gwId },
          { $push: { participants: user } }
        );

        return res.status(200).json({ success: true, message: 'Berhasil mendaftar giveaway!' });
      }

      if (action === 'roll') {
        // Jika sudah di-roll di DB, return data yang ada tanpa acak ulang
        if (giveaway.status === 'ended') {
          return res.status(200).json({ success: true, data: giveaway, isAlreadyEnded: true });
        }

        const participants = giveaway.participants || [];
        if (participants.length === 0) {
          return res.status(400).json({ success: false, error: 'Tidak ada peserta yang terdaftar untuk dikocok.' });
        }

        const shuffled = [...participants].sort(() => 0.5 - Math.random());
        const count = Math.min(giveaway.winnersCount || 1, participants.length);
        const winners = shuffled.slice(0, count);

        // Update ke database bahwa giveaway sudah ended
        await collection.updateOne(
          { _id: gwId },
          { $set: { status: 'ended', winners: winners, endedAt: new Date() } }
        );

        giveaway.status = 'ended';
        giveaway.winners = winners;

        return res.status(200).json({ success: true, data: giveaway, isAlreadyEnded: false });
      }

    } catch (e) {
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan server.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { giveawayId, userId } = req.body;
      if (userId !== OWNER_ID) {
        return res.status(403).json({ success: false, error: 'Hanya Owner yang dapat menghapus giveaway.' });
      }

      await collection.deleteOne({ _id: new ObjectId(giveawayId) });
      return res.status(200).json({ success: true, message: 'Giveaway berhasil dihapus.' });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Gagal menghapus giveaway.' });
    }
  }
}
