import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

const SHOP_ITEMS = [
  { itemId: 'potion_hp', name: 'Health Potion (Full HP)', type: 'heal', price: 100, stock: 15, description: 'Memulihkan HP waifu yang sudah habis (0) kembali penuh.' },
  { itemId: 'buff_atk', name: 'Power Scroll (+50 ATK)', type: 'stat_atk', price: 250, value: 50, stock: 10, description: 'Menambah statistik ATK permanen waifu terpilih.' },
  { itemId: 'buff_def', name: 'Armor Shield (+50 DEF)', type: 'stat_def', price: 200, value: 50, stock: 10, description: 'Menambah statistik DEF permanen waifu terpilih.' }
];

export default async function handler(req, res) {
  const { db } = await connectToDatabase();
  const usersCollection = db.collection('waifu_users');
  const shopStockCollection = db.collection('shop_stocks');
  const shopMetaCollection = db.collection('shop_meta');

  // Inisialisasi stok shop & metadata waktu reset jika belum ada
  const stockCount = await shopStockCollection.countDocuments();
  if (stockCount === 0) {
    await shopStockCollection.insertMany(SHOP_ITEMS.map(i => ({ ...i })));
    await shopMetaCollection.insertOne({ key: 'reset_timer', nextResetTime: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  }

  // Cek apakah sudah waktunya reset otomatis (24 jam)
  let meta = await shopMetaCollection.findOne({ key: 'reset_timer' });
  const now = new Date();

  if (!meta || now >= new Date(meta.nextResetTime)) {
    // Reset stok semua item kembali ke nilai awal
    for (const defItem of SHOP_ITEMS) {
      await shopStockCollection.updateOne(
        { itemId: defItem.itemId },
        { $set: { stock: defItem.stock } },
        { upsert: true }
      );
    }
    // Set waktu reset berikutnya 24 jam ke depan
    const nextReset = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await shopMetaCollection.updateOne(
      { key: 'reset_timer' },
      { $set: { nextResetTime: nextReset } },
      { upsert: true }
    );
    meta = { nextResetTime: nextReset };
  }

  if (req.method === 'GET') {
    const items = await shopStockCollection.find({}).toArray();
    return res.status(200).json({ 
      success: true, 
      items, 
      nextResetTime: meta.nextResetTime 
    });
  }

  if (req.method === 'POST') {
    try {
      const { userId, itemId, instanceId } = req.body;
      if (!userId || !itemId) {
        return res.status(400).json({ success: false, error: 'User ID dan Item ID diperlukan.' });
      }

      const dbUser = await usersCollection.findOne({ id: userId });
      if (!dbUser) return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });

      const shopItem = await shopStockCollection.findOne({ itemId });
      if (!shopItem) return res.status(404).json({ success: false, error: 'Item tidak ditemukan di shop.' });

      if (shopItem.stock !== undefined && shopItem.stock <= 0) {
        return res.status(400).json({ success: false, error: 'Stok item ini sudah habis! Tunggu reset besok.' });
      }

      if (dbUser.points < shopItem.price) {
        return res.status(400).json({ success: false, error: 'Poin Anda tidak cukup untuk membeli item ini!' });
      }

      let inventory = dbUser.inventory || [];
      let targetWaifuIndex = -1;

      if (instanceId) {
        targetWaifuIndex = inventory.findIndex(i => i.instanceId === instanceId);
        if (targetWaifuIndex === -1) {
          return res.status(400).json({ success: false, error: 'Waifu target tidak ditemukan di inventory.' });
        }
      }

      const newPoints = dbUser.points - shopItem.price;

      if (shopItem.type === 'heal') {
        if (!instanceId) return res.status(400).json({ success: false, error: 'Pilih waifu yang ingin dipulihkan HP-nya!' });
        let waifu = inventory[targetWaifuIndex];
        waifu.currentHp = waifu.hp;
        inventory[targetWaifuIndex] = waifu;
      } else if (shopItem.type === 'stat_atk') {
        if (!instanceId) return res.status(400).json({ success: false, error: 'Pilih waifu target!' });
        let waifu = inventory[targetWaifuIndex];
        waifu.attack += shopItem.value;
        inventory[targetWaifuIndex] = waifu;
      } else if (shopItem.type === 'stat_def') {
        if (!instanceId) return res.status(400).json({ success: false, error: 'Pilih waifu target!' });
        let waifu = inventory[targetWaifuIndex];
        waifu.defense += shopItem.value;
        inventory[targetWaifuIndex] = waifu;
      }

      if (shopItem.stock !== undefined) {
        await shopStockCollection.updateOne({ itemId }, { $inc: { stock: -1 } });
      }

      await usersCollection.updateOne(
        { id: userId },
        { $set: { points: newPoints, inventory: inventory } }
      );

      return res.status(200).json({
        success: true,
        message: `Berhasil membeli ${shopItem.name}!`,
        points: newPoints,
        inventory: inventory
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server shop.' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method tidak diizinkan.' });
}
