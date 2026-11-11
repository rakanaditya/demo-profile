import { connectToDatabase } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId tidak ditemukan' });
  }

  try {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Cari data user berdasarkan ID untuk mendapatkan access_token Discord mereka
    const userData = await usersCollection.findOne({ id: userId });

    if (!userData || !userData.access_token) {
      return res.status(401).json({ success: false, error: 'Sesi user tidak valid. Silakan login ulang.' });
    }

    // Ambil daftar server langsung dari Discord API menggunakan access_token user
    const discordRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${userData.access_token}`,
      },
    });

    const guildsData = await discordRes.json();

    if (!discordRes.ok) {
      return res.status(discordRes.status).json({ success: false, error: guildsData.message || 'Gagal mengambil data server dari Discord' });
    }

    return res.status(200).json({ success: true, guilds: guildsData });

  } catch (error) {
    console.error('Error fetching user guilds:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
