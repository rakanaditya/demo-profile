// api/logs.js
import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Ambil semua data user yang tersimpan/login, urutkan berdasarkan last_login terbaru
    const users = await usersCollection
      .find({})
      .sort({ last_login: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error("Gagal mengambil log user dari MongoDB:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
