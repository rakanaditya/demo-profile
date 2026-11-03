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
  const pvpRoomsCollection = db.collection('pvp_rooms');

  const existingWaifusCount = await waifusCollection.countDocuments();
  if (existingWaifusCount === 0) {
    await waifusCollection.insertMany(DEFAULT_WAIFUS);
  }

  const { action, userId, user } = req.method === 'POST' ? req.body : req.query;

  if (req.method === 'GET') {
    const { action: getAction, id, roomId } = req.query;
    
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
      const openRooms = await pvpRoomsCollection.find({ status: 'waiting' }).toArray();

      return res.status(200).json({ success: true, user: dbUser, waifus: allWaifus, openRooms });
    }

    if (getAction === 'check_room') {
      if (!roomId) return res.status(400).json({ success: false, error: 'Room ID diperlukan.' });
      const room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
      return res.status(200).json({ success: true, room });
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

      // 1. DAILY LOGIN
      if (action === 'daily') {
        const now = new Date();
        const lastClaim = dbUser.lastDailyClaim ? new Date(dbUser.lastDailyClaim) : null;
        let streak = dbUser.loginStreak || 0;
        
        if (lastClaim) {
          const diffHours = (now - lastClaim) / (1000 * 60 * 60);
          if (diffHours < 24) return res.status(400).json({ success: false, error: 'Reward harian sudah diambil hari ini!' });
          streak = (diffHours > 48) ? 1 : (streak % 7) + 1;
        } else {
          streak = 1;
        }

        const rewardPoints = streak * 100;
        const newPoints = dbUser.points + rewardPoints;
        await usersCollection.updateOne({ id: userId }, { $set: { points: newPoints, lastDailyClaim: now, loginStreak: streak } });

        return res.status(200).json({ success: true, message: `Klaim Berhasil! +${rewardPoints} Poin.`, points: newPoints, streak });
      }

      // 2. GACHA PULL
      if (action === 'gacha') {
        const gachaCost = 50;
        if (dbUser.points < gachaCost) return res.status(400).json({ success: false, error: 'Poin tidak cukup!' });

        const allWaifus = await waifusCollection.find({}).toArray();
        const rand = Math.random() * 100;
        let targetRarity = rand < 10 ? 'SSR' : (rand < 40 ? 'SR' : 'R');
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

        await usersCollection.updateOne({ id: userId }, { $set: { points: newPoints, inventory } });
        return res.status(200).json({ success: true, isDuplicate: existingIndex !== -1, waifu: updatedItem, points: newPoints });
      }

      // 3. DELETE WAIFU
      if (action === 'delete_waifu') {
        const { instanceId } = req.body;
        let inventory = (dbUser.inventory || []).filter(item => item.instanceId !== instanceId);
        await usersCollection.updateOne({ id: userId }, { $set: { inventory } });
        return res.status(200).json({ success: true, inventory });
      }

      // 4. MERGE DUPES
      if (action === 'merge_dupes') {
        let inventory = dbUser.inventory || [];
        const mergedMap = {};
        inventory.forEach(item => {
          const key = item.waifuId || item.name;
          if (!mergedMap[key]) mergedMap[key] = { ...item };
          else {
            mergedMap[key].dupes = (mergedMap[key].dupes || 1) + (item.dupes || 1);
            mergedMap[key].attack = Math.round(mergedMap[key].attack * 1.08);
            mergedMap[key].defense = Math.round(mergedMap[key].defense * 1.08);
            mergedMap[key].hp = Math.round(mergedMap[key].hp * 1.08);
          }
        });
        const newInventory = Object.values(mergedMap);
        await usersCollection.updateOne({ id: userId }, { $set: { inventory: newInventory } });
        return res.status(200).json({ success: true, inventory: newInventory, message: 'Berhasil merge duplikat!' });
      }

      // 5. PVP ROOM: CREATE ROOM
      if (action === 'create_pvp_room') {
        const { instanceId } = req.body;
        const waifu = (dbUser.inventory || []).find(i => i.instanceId === instanceId);
        if (!waifu) return res.status(400).json({ success: false, error: 'Waifu tidak ditemukan.' });

        const newRoom = {
          status: 'waiting', // waiting, ready, battling, finished
          player1: {
            id: dbUser.id,
            name: dbUser.global_name || dbUser.username,
            avatar: dbUser.avatar,
            waifu: waifu,
            currentHp: waifu.hp,
            maxHp: waifu.hp,
            ready: true
          },
          player2: null,
          logs: [],
          winner: null,
          createdAt: new Date()
        };

        const result = await pvpRoomsCollection.insertOne(newRoom);
        return res.status(200).json({ success: true, roomId: result.insertedId.toString(), room: newRoom });
      }

      // 6. PVP ROOM: JOIN ROOM
      if (action === 'join_pvp_room') {
        const { roomId, instanceId } = req.body;
        const waifu = (dbUser.inventory || []).find(i => i.instanceId === instanceId);
        if (!waifu) return res.status(400).json({ success: false, error: 'Waifu tidak ditemukan.' });

        const room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        if (!room || room.status !== 'waiting') return res.status(400).json({ success: false, error: 'Room tidak valid atau sudah mulai.' });

        const player2Data = {
          id: dbUser.id,
          name: dbUser.global_name || dbUser.username,
          avatar: dbUser.avatar,
          waifu: waifu,
          currentHp: waifu.hp,
          maxHp: waifu.hp,
          ready: true
        };

        // Jika kedua player sudah ready, mulai pertarungan otomatis secara turn-based simulation
        await pvpRoomsCollection.updateOne(
          { _id: new ObjectId(roomId) },
          { $set: { player2: player2Data, status: 'battling' } }
        );

        return res.status(200).json({ success: true, roomId });
      }

      // 7. SIMULASI / AMBIL STATUS & JALANKAN TURN BATTLE REAL-TIME
      if (action === 'get_pvp_status') {
        const { roomId } = req.body;
        const room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        if (!room) return res.status(400).json({ success: false, error: 'Room tidak ditemukan.' });

        // Jika status battling dan belum ada logs / winner, hitung pertarungan turn-based otomatis
        if (room.status === 'battling' && (!room.logs || room.logs.length === 0)) {
          let p1Hp = room.player1.currentHp;
          let p2Hp = room.player2.currentHp;
          const p1W = room.player1.waifu;
          const p2W = room.player2.waifu;
          let logs = [];

          let turn = 1;
          while (p1Hp > 0 && p2Hp > 0 && turn <= 10) {
            // P1 menyerang P2
            let p1Damage = Math.max(10, Math.round(p1W.attack * (Math.random() * 0.4 + 0.8) - p2W.defense * 0.3));
            p2Hp = Math.max(0, p2Hp - p1Damage);
            logs.push({ turn, attacker: room.player1.name, defender: room.player2.name, damage: p1Damage, p2Hp, p1Hp });
            if (p2Hp <= 0) break;

            // P2 menyerang P1
            let p2Damage = Math.max(10, Math.round(p2W.attack * (Math.random() * 0.4 + 0.8) - p1W.defense * 0.3));
            p1Hp = Math.max(0, p1Hp - p2Damage);
            logs.push({ turn, attacker: room.player2.name, defender: room.player1.name, damage: p2Damage, p2Hp, p1Hp });
            turn++;
          }

          let winner = p1Hp > p2Hp ? room.player1.name : room.player2.name;
          if (p1Hp === p2Hp) winner = 'Draw';

          await pvpRoomsCollection.updateOne(
            { _id: new ObjectId(roomId) },
            { $set: { status: 'finished', logs, winner, 'player1.currentHp': p1Hp, 'player2.currentHp': p2Hp } }
          );

          const updatedRoom = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
          // Berikan reward poin ke pemenang
          if (winner === room.player1.name) {
            await usersCollection.updateOne({ id: room.player1.id }, { $inc: { points: 250 } });
          } else if (winner === room.player2.name) {
            await usersCollection.updateOne({ id: room.player2.id }, { $inc: { points: 250 } });
          }

          return res.status(200).json({ success: true, room: updatedRoom });
        }

        return res.status(200).json({ success: true, room });
      }

      return res.status(400).json({ success: false, error: 'Aksi tidak valid.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  }
}
