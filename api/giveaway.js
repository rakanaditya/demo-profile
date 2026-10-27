// api/giveaway.js
import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

const OWNER_ID = '628205121704296458';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  try {
    const { db } = await connectToDatabase();
    const giveawaysCol = db.collection('giveaways');

    // 1. GET: Ambil daftar giveaway & kalkulasi Leaderboard
    if (req.method === 'GET') {
      const giveaways = await giveawaysCol.find({}).sort({ createdAt: -1 }).toArray();
      const now = new Date();

      // Auto end / roll jika timer habis
      for (let gw of giveaways) {
        if (gw.status === 'active' && gw.endsAt && new Date(gw.endsAt) <= now) {
          let selectedWinners = [];
          if (gw.participants && gw.participants.length > 0) {
            const shuffled = [...gw.participants].sort(() => 0.5 - Math.random());
            selectedWinners = shuffled.slice(0, Math.min(gw.winnersCount || 1, gw.participants.length));
          }
          await giveawaysCol.updateOne(
            { _id: gw._id },
            { $set: { winners: selectedWinners, status: 'ended', endedAt: now } }
          );
          gw.status = 'ended';
          gw.winners = selectedWinners;
          gw.endedAt = now;
        }
      }

      // Jika memanggil dengan query ?type=leaderboard
      if (req.query.type === 'leaderboard') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Filter giveaway yang selesai dalam 7 hari terakhir untuk Top Pemenang Mingguan
        const weeklyEndedGiveaways = giveaways.filter(gw => 
          gw.status === 'ended' && gw.endedAt && new Date(gw.endedAt) >= oneWeekAgo
        );

        // Hitung Kemenangan Per User (Mingguan)
        const winnerStats = {};
        weeklyEndedGiveaways.forEach(gw => {
          if (gw.winners && gw.winners.length > 0) {
            gw.winners.forEach(w => {
              if (!winnerStats[w.id]) {
                winnerStats[w.id] = {
                  id: w.id,
                  username: w.username,
                  global_name: w.global_name || w.username,
                  avatar: w.avatar,
                  winsCount: 0
                };
              }
              winnerStats[w.id].winsCount += 1;
            });
          }
        });

        const topWinners = Object.values(winnerStats)
          .sort((a, b) => b.winsCount - a.winsCount)
          .slice(0, 10); // Top 10

        return res.status(200).json({ 
          success: true, 
          allGiveaways: giveaways,
          topWinners: topWinners,
          resetAt: new Date(now.getTime() + (7 - now.getDay()) * 24 * 60 * 60 * 1000)
        });
      }

      return res.status(200).json({ success: true, data: giveaways });
    }

    // 2. POST: Buat Giveaway Baru
    if (req.method === 'POST') {
      const { title, description, prize, winnersCount, durationValue, durationUnit, userId } = body;

      if (!userId || userId !== OWNER_ID) {
        return res.status(403).json({ success: false, error: 'Akses ditolak.' });
      }

      let endsAt = null;
      const val = parseInt(durationValue) || 0;
      if (val > 0 && durationUnit) {
        endsAt = new Date();
        if (durationUnit === 'minutes') endsAt.setMinutes(endsAt.getMinutes() + val);
        else if (durationUnit === 'hours') endsAt.setHours(endsAt.getHours() + val);
        else if (durationUnit === 'days') endsAt.setDate(endsAt.getDate() + val);
        else if (durationUnit === 'weeks') endsAt.setDate(endsAt.getDate() + (val * 7));
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
        endsAt: endsAt,
        createdBy: userId
      };

      const result = await giveawaysCol.insertOne(newGiveaway);
      return res.status(200).json({ success: true, message: 'Giveaway dibuat!', data: { ...newGiveaway, _id: result.insertedId } });
    }

    // 3. PUT: Join / Manual Roll
    if (req.method === 'PUT') {
      const { action, giveawayId, user, userId } = body;

      if (action === 'join') {
        if (!user || !user.id) return res.status(401).json({ success: false, error: 'Login Discord terlebih dahulu!' });

        const giveaway = await giveawaysCol.findOne({ _id: new ObjectId(giveawayId) });
        if (!giveaway) return res.status(404).json({ success: false, error: 'Giveaway tidak ditemukan!' });
        if (giveaway.status === 'ended') return res.status(400).json({ success: false, error: 'Giveaway sudah berakhir!' });

        if (giveaway.participants.some(p => p.id === user.id)) {
          return res.status(400).json({ success: false, error: 'Anda sudah mendaftar!' });
        }

        await giveawaysCol.updateOne(
          { _id: new ObjectId(giveawayId) },
          { $push: { participants: { id: user.id, username: user.username, global_name: user.global_name, avatar: user.avatar, joinedAt: new Date() } } }
        );

        return res.status(200).json({ success: true, message: 'Berhasil mendaftar!' });
      }

      if (action === 'roll') {
        if (!userId || userId !== OWNER_ID) return res.status(403).json({ success: false, error: 'Akses ditolak.' });

        const giveaway = await giveawaysCol.findOne({ _id: new ObjectId(giveawayId) });
        if (!giveaway || !giveaway.participants.length) {
          return res.status(400).json({ success: false, error: 'Tidak ada peserta.' });
        }

        const shuffled = [...giveaway.participants].sort(() => 0.5 - Math.random());
        const selectedWinners = shuffled.slice(0, Math.min(giveaway.winnersCount || 1, giveaway.participants.length));

        await giveawaysCol.updateOne(
          { _id: new ObjectId(giveawayId) },
          { $set: { winners: selectedWinners, status: 'ended', endedAt: new Date() } }
        );

        return res.status(200).json({ success: true, winners: selectedWinners });
      }
    }

    // 4. DELETE: Hapus
    if (req.method === 'DELETE') {
      const { giveawayId, userId } = body;
      if (!userId || userId !== OWNER_ID) return res.status(403).json({ success: false, error: 'Akses ditolak.' });
      await giveawaysCol.deleteOne({ _id: new ObjectId(giveawayId) });
      return res.status(200).json({ success: true, message: 'Giveaway dihapus!' });
    }

    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
