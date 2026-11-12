import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  const { action, guildId, userId } = req.query;

  try {
    const { db } = await connectToDatabase();

    // 1. Endpoint untuk mengambil daftar Server (Guilds) User
    if (req.method === 'GET' && action === 'guilds') {
      if (!userId) return res.status(400).json({ success: false, error: 'userId diperlukan' });

      const userData = await db.collection('users').findOne({ id: userId });
      if (!userData || !userData.access_token) {
        return res.status(401).json({ success: false, error: 'Sesi user tidak valid. Silakan login ulang.' });
      }

      const discordRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${userData.access_token}` },
      });
      const guildsData = await discordRes.json();
      if (!discordRes.ok) return res.status(discordRes.status).json({ success: false, error: guildsData.message });

      return res.status(200).json({ success: true, guilds: guildsData });
    }

    // 2. Endpoint GET Konfigurasi Commands per Server
    if (req.method === 'GET' && action === 'config') {
      if (!guildId) return res.status(400).json({ success: false, error: 'guildId diperlukan' });

      const config = await db.collection('bot_configs').findOne({ type: 'slash_commands', guildId: guildId });
      const defaultCommands = [
          { name: 'giveaway list', description: 'Melihat daftar giveaway aktif.', enabled: true },
          { name: 'giveaway start', description: 'Membuat event giveaway baru.', enabled: true },
          { name: 'gacha roll', description: 'Lakukan gacha summon waifu impian.', enabled: true },
          { name: 'gacha profile', description: 'Melihat statistik poin dan koleksi.', enabled: true },
          { name: 'givepoint', description: 'Lakukan gacha summon waifu impian.', enabled: true },
          { name: 'removepoint', description: 'Lakukan gacha summon waifu impian.', enabled: true }
      ];

      return res.status(200).json({ success: true, commands: config ? config.commands : defaultCommands });
    }

    // 3. Endpoint POST Simpan Konfigurasi Commands per Server
    if (req.method === 'POST') {
      const { userId, guildId, commands } = req.body;
      if (!guildId) return res.status(400).json({ success: false, error: 'guildId diperlukan' });

      await db.collection('bot_configs').updateOne(
        { type: 'slash_commands', guildId: guildId },
        { $set: { lastUpdatedBy: userId, commands: commands, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({ success: true, message: 'Konfigurasi server berhasil disimpan' });
    }

    return res.status(405).json({ success: false, error: 'Invalid action or method' });

  } catch (error) {
    console.error('Error marin API:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
