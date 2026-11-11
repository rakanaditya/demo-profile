import { connectToDatabase } from '../db.js';

export default async function handler(req, res) {
  // Hanya izinkan method POST atau GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const configCollection = db.collection('bot_configs');

    if (req.method === 'POST') {
      const { userId, status } = req.body;

      // Simpan atau perbarui konfigurasi command berdasarkan admin yang mengubah
      await configCollection.updateOne(
        { type: 'slash_commands' },
        { 
          $set: { 
            lastUpdatedBy: userId, 
            status: status,
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true, message: 'Konfigurasi berhasil disimpan' });
    }

    if (req.method === 'GET') {
      const config = await configCollection.findOne({ type: 'slash_commands' });
      return res.status(200).json({ success: true, data: config || {} });
    }

  } catch (error) {
    console.error('Error marin config API:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
