import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

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
      const activeUsers = await usersCollection.find({ id: { $ne: id }, 'inventory.0': { $exists: true } }).project({ id: 1, global_name: 1, username: 1, avatar: 1, inventory: 1 }).toArray();

      return res.status(200).json({ success: true, user: dbUser, waifus: allWaifus, opponents: activeUsers });
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

      // 1. DAILY LOGIN REWARD
      if (action === 'daily') {
        const now = new Date();
        const lastClaim = dbUser.lastDailyClaim ? new Date(dbUser.lastDailyClaim) : null;
        let streak = dbUser.loginStreak || 0;
        
        if (lastClaim) {
          const diffHours = (now - lastClaim) / (1000 * 60 * 60);
          if (diffHours < 24) {
            return res.status(400).json({ success: false, error: 'Reward harian sudah diambil hari ini. Coba lagi besok!' });
          }
          if (diffHours > 48) {
            streak = 1;
          } else {
            streak = (streak % 7) + 1;
          }
        } else {
          streak = 1;
        }

        const rewardPoints = streak * 100;
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

      // 2. GACHA PULL
      if (action === 'gacha') {
        const gachaCost = 50;
        if (dbUser.points < gachaCost) {
          return res.status(400).json({ success: false, error: 'Poin Anda tidak cukup! Lakukan Daily Login atau Battle.' });
        }

        const allWaifus = await waifusCollection.find({}).toArray();
        if (allWaifus.length === 0) {
          return res.status(400).json({ success: false, error: 'Belum ada data waifu.' });
        }

        const rand = Math.random() * 100;
        let targetRarity = 'R';
        if (rand < 10) targetRarity = 'SSR';
        else if (rand < 40) targetRarity = 'SR';

        let pool = allWaifus.filter(w => w.rarity === targetRarity);
        if (pool.length === 0) pool = allWaifus;

        const pulledWaifu = pool[Math.floor(Math.random() * pool.length)];
        const newPoints = dbUser.points - gachaCost;

        let inventory = dbUser.inventory || [];
        let existingIndex = inventory.findIndex(item => item.waifuId === pulledWaifu.id);

        let updatedItem;
        if (existingIndex !== -1) {
          let item = inventory[existingIndex];
          item.dupes = (item.dupes || 1) + 1;
          item.attack = Math.round(item.attack * 1.08);
          item.defense = Math.round(item.defense * 1.08);
          item.hp = Math.round(item.hp * 1.08);
          updatedItem = item;
          inventory[existingIndex] = item;
        } else {
          updatedItem = {
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
            dupes: 1,
            obtainedAt: new Date()
          };
          inventory.push(updatedItem);
        }

        await usersCollection.updateOne(
          { id: userId },
          { $set: { points: newPoints, inventory: inventory } }
        );

        const isDuplicate = existingIndex !== -1;
        return res.status(200).json({
          success: true,
          isDuplicate: isDuplicate,
          message: isDuplicate 
            ? `Duplikat! ${pulledWaifu.name} digabungkan (Dupes: x${updatedItem.dupes}, Stats Meningkat!).`
            : `Selamat! Anda mendapatkan ${pulledWaifu.name} (${pulledWaifu.rarity}) baru!`,
          waifu: updatedItem,
          points: newPoints
        });
      }

      // 3. DELETE WAIFU FROM INVENTORY
      if (action === 'delete_waifu') {
        const { instanceId } = req.body;
        let inventory = dbUser.inventory || [];
        const initialLen = inventory.length;
        inventory = inventory.filter(item => item.instanceId !== instanceId);

        if (inventory.length === initialLen) {
          return res.status(400).json({ success: false, error: 'Waifu tidak ditemukan di inventory.' });
        }

        await usersCollection.updateOne(
          { id: userId },
          { $set: { inventory: inventory } }
        );

        return res.status(200).json({ success: true, inventory: inventory, message: 'Waifu berhasil dihapus dari inventory.' });
      }

      // 4. MERGE DUPES
      if (action === 'merge_dupes') {
        let inventory = dbUser.inventory || [];
        const mergedMap = {};

        inventory.forEach(item => {
          const key = item.waifuId || item.name;
          if (!mergedMap[key]) {
            mergedMap[key] = { ...item };
          } else {
            mergedMap[key].dupes = (mergedMap[key].dupes || 1) + (item.dupes || 1);
            mergedMap[key].attack = Math.round(mergedMap[key].attack * 1.08);
            mergedMap[key].defense = Math.round(mergedMap[key].defense * 1.08);
            mergedMap[key].hp = Math.round(mergedMap[key].hp * 1.08);
          }
        });

        const newInventory = Object.values(mergedMap);
        await usersCollection.updateOne(
          { id: userId },
          { $set: { inventory: newInventory } }
        );

        return res.status(200).json({ success: true, inventory: newInventory, message: 'Semua duplikat berhasil digabungkan dan statistik meningkat!' });
      }

      // 5. ARENA BATTLE
      if (action === 'battle') {
        const { instanceId, opponentType, opponentUserId, opponentInstanceId } = req.body;
        const userWaifu = dbUser.inventory.find(item => item.instanceId === instanceId);
        
        if (!userWaifu) {
          return res.status(400).json({ success: false, error: 'Waifu pilihan tidak ditemukan di inventory.' });
        }

        let enemyWaifu = null;
        let enemyName = '';

        if (opponentType === 'user' && opponentUserId && opponentInstanceId) {
          const targetUser = await usersCollection.findOne({ id: opponentUserId });
          if (targetUser && targetUser.inventory) {
            const targetWaifu = targetUser.inventory.find(i => i.instanceId === opponentInstanceId);
            if (targetWaifu) {
              enemyWaifu = targetWaifu;
              enemyName = `[PVP] ${targetUser.global_name || targetUser.username} (${targetWaifu.name})`;
            }
          }
        }

        if (!enemyWaifu) {
          const allWaifus = await waifusCollection.find({}).toArray();
          const randBot = allWaifus[Math.floor(Math.random() * allWaifus.length)];
          enemyWaifu = randBot;
          enemyName = `[Bot Arena] ${randBot.name}`;
        }

        const playerPower = userWaifu.attack * 1.2 + userWaifu.hp * 0.1;
        const enemyPower = (enemyWaifu.attack || 700) * 1.2 + (enemyWaifu.hp || 2500) * 0.1;
        
        const winProbability = playerPower / (playerPower + enemyPower);
        const isWin = Math.random() < winProbability;
        const rewardPoints = isWin ? 180 : 40;

        const newPoints = dbUser.points + rewardPoints;
        await usersCollection.updateOne(
          { id: userId },
          { $set: { points: newPoints } }
        );

        return res.status(200).json({
          success: true,
          win: isWin,
          enemy: enemyWaifu,
          enemyDisplayName: enemyName,
          reward: rewardPoints,
          points: newPoints,
          message: isWin ? `Kemenangan Gemilang melawan ${enemyName}! Mendapatkan +${rewardPoints} Poin.` : `Pertarungan Sengit melawan ${enemyName}! Kalah tapi tetap mendapat konsolasi +${rewardPoints} Poin.`
        });
      }

      return res.status(400).json({ success: false, error: 'Aksi tidak valid.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  }
}
