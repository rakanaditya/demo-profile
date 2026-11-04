import { connectToDatabase } from './db.js';

// Daftar kode redeem yang aktif beserta hadiahnya
const REDEEM_CODES = {
  'RELEASE': { points: 500, description: 'Bonus Peluncuran Waifu Gacha Hub (+500 Poin)' },
  'RAKANADITYA': { points: 1000, description: 'Kode Spesial Komunitas Rakan Aditya (+1000 Poin)' }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method tidak diizinkan.' });
  }

  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ success: false, error: 'User ID dan Kode Redeem diperlukan.' });
    }

    const upperCode = code.trim().toUpperCase();
    const reward = REDEEM_CODES[upperCode];

    if (!reward) {
      return res.status(400).json({ success: false, error: 'Kode Redeem tidak valid atau sudah kedaluwarsa!' });
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection('waifu_users');
    const redeemLogsCollection = db.collection('redeem_logs');

    const dbUser = await usersCollection.findOne({ id: userId });
    if (!dbUser) {
      return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });
    }

    // Cek apakah user sudah pernah menukarkan kode ini sebelumnya
    const alreadyRedeemed = await redeemLogsCollection.findOne({ userId: userId, code: upperCode });
    if (alreadyRedeemed) {
      return res.status(400).json({ success: false, error: 'Anda sudah pernah menukarkan kode redeem ini!' });
    }

    // Catat log redeem
    await redeemLogsCollection.insertOne({
      userId: userId,
      code: upperCode,
      redeemedAt: new Date()
    });

    // Tambahkan poin ke user
    const newPoints = (dbUser.points || 0) + reward.points;
    await usersCollection.updateOne(
      { id: userId },
      { $set: { points: newPoints } }
    );

    return res.status(200).json({
      success: true,
      message: `Berhasil menukarkan kode ${upperCode}! Mendapatkan +${reward.points} Poin.`,
      points: newPoints
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server redeem.' });
  }
}
