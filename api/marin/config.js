import { connectToDatabase } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const configCollection = db.collection('bot_configs');

    // --- METHOD POST: Menyimpan Konfigurasi Commands per Server ---
    if (req.method === 'POST') {
      const { userId, guildId, commands } = req.body;

      if (!guildId) {
        return res.status(400).json({ success: false, error: 'guildId diperlukan' });
      }

      await configCollection.updateOne(
        { type: 'slash_commands', guildId: guildId },
        { 
          $set: { 
            lastUpdatedBy: userId, 
            commands: commands,
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true, message: 'Konfigurasi server berhasil disimpan' });
    }

    // --- METHOD GET: Mengambil Konfigurasi Commands Berdasarkan Server ---
    if (req.method === 'GET') {
      const { guildId } = req.query;

      if (!guildId) {
        return res.status(400).json({ success: false, error: 'guildId diperlukan' });
      }

      const config = await configCollection.findOne({ type: 'slash_commands', guildId: guildId });
      
      // Jika belum ada konfigurasi tersimpan, berikan default commands
      const defaultCommands = [
        { name: 'giveaway start', description: 'Memulai sesi event giveaway baru di channel.', enabled: true },
        { name: 'gacha roll', description: 'Melakukan gacha karakter waifu interaktif.', enabled: true },
        { name: 'gacha profile', description: 'Melihat statistik dan koleksi waifu.', enabled: true }
      ];

      return res.status(200).json({ 
        success: true, 
        commands: config ? config.commands : defaultCommands 
      });
    }

  } catch (error) {
    console.error('Error marin config API:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
