import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

// Daftar Waifu Master Default (Secara otomatis tersinkronisasi ke MongoDB jika database kosong)
// Anda bisa menambahkan file baru di folder Assets/Waifu/ dan menambahkannya ke daftar ini atau database langsung.
const DEFAULT_WAIFUS = [
  { id: 'lufas', name: 'Lufas Mapha', title: 'Black-Winged Sovereign', element: 'Dark', rarity: 'SSR', attack: 950, defense: 820, hp: 3200, image: '/Assets/Waifu/lufas.gif', description: 'Penguasa kegelapan bersayap hitam yang legendaris.' },
  { id: 'rem', name: 'Rem', title: 'The Maid of Oni', element: 'Water', rarity: 'SR', attack: 780, defense: 750, hp: 2800, image: '/Assets/Waifu/rem.gif', description: 'Pelayan setia dengan kekuatan oni yang luar biasa.' },
  { id: 'asuna', name: 'Asuna Yuuki', title: 'The Lightning Flash', element: 'Light', rarity: 'SSR', attack: 910, defense: 700, hp: 2900, image: '/Assets/Waifu/asuna.gif', description: 'Pendekar pedang super cepat dari dunia Aincrad.' },
  { id: 'zero_two', name: 'Zero Two', title: 'Partner Killer', element: 'Fire', rarity: 'SSR', attack: 930, defense: 680, hp: 3100, image: '/Assets/Waifu/zerotwo.gif', description: 'Gadis bertanduk dengan darah klakosaur di nadinya.' },
  { id: 'miku', name: 'Hatsune Miku', title: 'Virtual Diva', element: 'Wind', rarity: 'R', attack: 650, defense: 600, hp: 2400, image: '/Assets/Waifu/miku.gif', description: 'Idola virtual bersuara merdu yang menginspirasi dunia.' }
];

export default async function handler(req, res) {
  const { db } = await connectToDatabase();
  const usersCollection = db.collection('waifu_users');
  const waifusCollection = db.collection('waifus');

  // Sinkronisasi otomatis master data waifu ke MongoDB
  const existingWaifusCount = await waifusCollection.countDocuments();
  if (existingWaifusCount === 0) {
    await waifusCollection.insertMany(DEFAULT_WAIFUS);
  }

  const { action, userId, user } = req.method === 'POST' ? req.body : req.query;

  if (req.method === 'GET') {
    const { action: getAction, id } = req.query;
    
    if (getAction === 'profile') {
      if (!id) return res.status(400).json({ success: false, error: 'User ID diperlukan.' });
      let dbUser = await usersCollection.findOne({ id: id });
      
      // Jika user pertama kali login Discord, berikan bonus awal 100 poin
      if (!dbUser) {
        dbUser = {
          id: id,
          username: req.query.username || 'User',
          global_name: req.query.global_name || 'User',
          avatar: req.query.avatar || '',
          points: 100,
          inventory: [],
          lastDailyClaim: null,
          loginStreak: 0,
          createdAt: new Date()
        };
        await usersCollection.insertOne(dbUser);
      }
      
      const allWaifus = await waifusCollection.find({}).toArray();
      return res.status(200).json({ success: true, user: dbUser, waifus: allWaifus });
    }

    const allWaifus = await waifusCollection.find({}).toArray();
    return res.status(200).json({ success: true, waifus: allWaifus });
  }

  if (req.method === 'POST') {
    try {
      let dbUser = await usersCollection.findOne({ id: userId });
      if (!dbUser && user) {
        dbUser = {
          id: user.id,
          username: user.username,
          global_name: user.global_name || user.username,
          avatar: user.avatar || '',
          points: 100,
          inventory: [],
          lastDailyClaim: null,
          loginStreak: 0,
          createdAt: new Date()
        };
        await usersCollection.insertOne(dbUser);
      }

      if (!dbUser) {
        return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });
      }

      // 1. SYSTEM DAILY LOGIN REWARD (Day 1 = 100 point, s.d Day 7)
      if (action === 'daily') {
        const now = new Date();
        const lastClaim = dbUser.lastDailyClaim ? new Date(dbUser.lastDailyClaim) : null;
        let streak = dbUser.loginStreak || 0;
        
        if (lastClaim) {
          const diffHours = (now - lastClaim) / (1000 * 60 * 60);
          if (diffHours < 24) {
            return res.status(400).json({ success: false, error: 'Reward harian sudah diambil hari ini. Silakan coba lagi besok!' });
          }
          if (diffHours > 48) {
            streak = 1; // Reset streak jika terlewat lebih dari 2 hari
          } else {
            streak = (streak % 7) + 1;
          }
        } else {
          streak = 1;
        }

        const rewardPoints = streak * 100; // Day 1: 100, Day 2: 200, ..., Day 7: 700
        const newPoints = dbUser.points + rewardPoints;

        await usersCollection.updateOne(
          { id: userId },
          { $set: { points: newPoints, lastDailyClaim: now, loginStreak: streak } }
        );

        return res.status(200).json({
          success: true,
          message: `Berhasil klaim Daily Reward Hari ke-${streak}! Mendapatkan +${rewardPoints} Poin.`,
          points: newPoints,
          streak: streak
        });
      }

      // 2. SYSTEM GACHA PULL (Biaya 50 Poin)
      if (action === 'gacha') {
        const gachaCost = 50;
        if (dbUser.points < gachaCost) {
          return res.status(400).json({ success: false, error: 'Poin Anda tidak cukup! Lakukan Daily Login atau Battle untuk menambah poin.' });
        }

        const allWaifus = await waifusCollection.find({}).toArray();
        if (allWaifus.length === 0) {
          return res.status(400).json({ success: false, error: 'Belum ada data waifu di database.' });
        }

        // Distribusi Rarity: SSR (10%), SR (30%), R (60%)
        const rand = Math.random() * 100;
        let targetRarity = 'R';
        if (rand < 10) targetRarity = 'SSR';
        else if (rand < 40) targetRarity = 'SR';

        let pool = allWaifus.filter(w => w.rarity === targetRarity);
        if (pool.length === 0) pool = allWaifus;

        const pulledWaifu = pool[Math.floor(Math.random() * pool.length)];
        const newPoints = dbUser.points - gachaCost;

        const inventoryItem = {
          instanceId: new ObjectId().toString(),
          waifuId: pulledWaifu.id,
          name: pulledWaifu.name,
          title: pulledWaifu.title,
          rarity: pulledWaifu.rarity,
          element: pulledWaifu.element,
          attack: pulledWaifu.attack,
          defense: pulledWaifu.defense,
          hp: pulledWaifu.hp,
          image: pulledWaifu.image,
          obtainedAt: new Date()
        };

        await usersCollection.updateOne(
          { id: userId },
          { 
            $set: { points: newPoints },
            $push: { inventory: inventoryItem }
          }
        );

        return res.status(200).json({
          success: true,
          message: `Selamat! Anda mendapatkan ${pulledWaifu.name} (${pulledWaifu.rarity})!`,
          waifu: inventoryItem,
          points: newPoints
        });
      }

      // 3. SYSTEM BATTLE ARENA (Statistik berbeda & peluang menang berdasarkan ATK)
      if (action === 'battle') {
        const { instanceId } = req.body;
        const userWaifu = dbUser.inventory.find(item => item.instanceId === instanceId);
        
        if (!userWaifu) {
          return res.status(400).json({ success: false, error: 'Waifu pilihan tidak ditemukan di inventory.' });
        }

        const allWaifus = await waifusCollection.find({}).toArray();
        const enemyWaifu = allWaifus[Math.floor(Math.random() * allWaifus.length)];

        // Kalkulasi peluang menang berdasarkan Attack & HP
        const playerPower = userWaifu.attack * 1.2 + userWaifu.hp * 0.1;
        const enemyPower = enemyWaifu.attack * 1.2 + enemyWaifu.hp * 0.1;
        
        const winProbability = playerPower / (playerPower + enemyPower);
        const isWin = Math.random() < winProbability;
        const rewardPoints = isWin ? 150 : 30;

        const newPoints = dbUser.points + rewardPoints;
        await usersCollection.updateOne(
          { id: userId },
          { $set: { points: newPoints } }
        );

        return res.status(200).json({
          success: true,
          win: isWin,
          enemy: enemyWaifu,
          reward: rewardPoints,
          points: newPoints,
          message: isWin ? `Pertarungan Menang! Waifu Anda mengalahkan ${enemyWaifu.name} (+${rewardPoints} Poin)` : `Pertarungan Sengit! Kalah tapi tetap mendapat konsolasi +${rewardPoints} Poin.`
        });
      }

      return res.status(400).json({ success: false, error: 'Aksi tidak valid.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  }
}
