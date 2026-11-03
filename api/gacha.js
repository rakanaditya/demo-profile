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
      const openRooms = await pvpRoomsCollection.find({ status: 'waiting', 'player1.id': { $ne: id } }).toArray();

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

      if (!dbUser) return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });

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

      // 2. GACHA PULL & AUTO DUPLICATE MERGE
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

      // 4. MANUAL MERGE DUPES
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

      // 5. PVP ROOM: CREATE ROOM (Anti Duplicate Active Room)
      if (action === 'create_pvp_room') {
        const { instanceId, isBot } = req.body;
        const waifu = (dbUser.inventory || []).find(i => i.instanceId === instanceId);
        if (!waifu) return res.status(400).json({ success: false, error: 'Waifu tidak ditemukan.' });

        const existingRoom = await pvpRoomsCollection.findOne({
          $or: [
            { 'player1.id': userId, status: { $in: ['waiting', 'battling'] } },
            { 'player2.id': userId, status: { $in: ['waiting', 'battling'] } }
          ]
        });
        if (existingRoom) {
          return res.status(400).json({ success: false, error: 'Anda masih memiliki room aktif yang belum selesai.' });
        }

        let player2Data = null;
        let initialStatus = 'waiting';

        if (isBot) {
          const allWaifus = await waifusCollection.find({}).toArray();
          const randBotWaifu = allWaifus[Math.floor(Math.random() * allWaifus.length)];
          player2Data = {
            id: 'bot_ai',
            name: `[Bot] ${randBotWaifu.name}`,
            avatar: '',
            waifu: { ...randBotWaifu, instanceId: 'bot_inst', dupes: 1 },
            currentHp: randBotWaifu.hp,
            maxHp: randBotWaifu.hp,
            ready: true
          };
          initialStatus = 'battling';
        }

        const newRoom = {
          status: initialStatus,
          player1: {
            id: dbUser.id,
            name: dbUser.global_name || dbUser.username,
            avatar: dbUser.avatar,
            waifu: waifu,
            currentHp: waifu.hp,
            maxHp: waifu.hp,
            ready: false
          },
          player2: player2Data,
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
        if (!room || room.status !== 'waiting') return res.status(400).json({ success: false, error: 'Room tidak valid atau sudah dimulai.' });
        if (room.player1.id === userId) return res.status(400).json({ success: false, error: 'Tidak bisa bergabung ke room sendiri.' });

        const player2Data = {
          id: dbUser.id,
          name: dbUser.global_name || dbUser.username,
          avatar: dbUser.avatar,
          waifu: waifu,
          currentHp: waifu.hp,
          maxHp: waifu.hp,
          ready: false
        };

        await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $set: { player2: player2Data } });
        return res.status(200).json({ success: true, roomId });
      }

      // 7. PLAYER READY ACTION
      if (action === 'player_ready') {
        const { roomId } = req.body;
        const room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        if (!room) return res.status(400).json({ success: false, error: 'Room tidak ditemukan.' });

        let updateField = {};
        if (room.player1 && room.player1.id === userId) updateField['player1.ready'] = true;
        else if (room.player2 && room.player2.id === userId) updateField['player2.ready'] = true;

        await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $set: updateField });

        const updatedRoom = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        if (updatedRoom.player1 && updatedRoom.player1.ready && updatedRoom.player2 && updatedRoom.player2.ready && updatedRoom.status === 'waiting') {
          await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $set: { status: 'battling' } });
        }

        return res.status(200).json({ success: true });
      }

      // 8. PROCESS PVP TURN SIMULATION & LOGS
      if (action === 'get_pvp_status') {
        const { roomId } = req.body;
        let room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        if (!room) return res.status(400).json({ success: false, error: 'Room tidak ditemukan.' });

        if (room.status === 'battling' && (!room.logs || room.logs.length === 0)) {
          let p1Hp = room.player1.currentHp;
          let p2Hp = room.player2.currentHp;
          const p1W = room.player1.waifu;
          const p2W = room.player2.waifu;
          let logs = [];

          let turn = 1;
          while (p1Hp > 0 && p2Hp > 0 && turn <= 10) {
            let p1Damage = Math.max(15, Math.round(p1W.attack * (Math.random() * 0.3 + 0.85) - p2W.defense * 0.25));
            p2Hp = Math.max(0, p2Hp - p1Damage);
            logs.push({ turn, attacker: room.player1.name, defender: room.player2.name, damage: p1Damage, p2Hp, p1Hp });
            if (p2Hp <= 0) break;

            let p2Damage = Math.max(15, Math.round(p2W.attack * (Math.random() * 0.3 + 0.85) - p1W.defense * 0.25));
            p1Hp = Math.max(0, p1Hp - p2Damage);
            logs.push({ turn, attacker: room.player2.name, defender: room.player1.name, damage: p2Damage, p2Hp, p1Hp });
            turn++;
          }

          let winner = p1Hp > p2Hp ? room.player1.name : (p2Hp > p1Hp ? room.player2.name : 'Draw');

          await pvpRoomsCollection.updateOne(
            { _id: new ObjectId(roomId) },
            { $set: { status: 'finished', logs, winner, 'player1.currentHp': p1Hp, 'player2.currentHp': p2Hp } }
          );

          room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
          if (winner === room.player1.name && room.player1.id !== 'bot_ai') {
            await usersCollection.updateOne({ id: room.player1.id }, { $inc: { points: 200 } });
          } else if (winner === room.player2.name && room.player2.id !== 'bot_ai') {
            await usersCollection.updateOne({ id: room.player2.id }, { $inc: { points: 200 } });
          }
        }

        return res.status(200).json({ success: true, room });
      }

      // 9. LEAVE / CANCEL ROOM
      if (action === 'leave_room') {
        const { roomId } = req.body;
        await pvpRoomsCollection.deleteOne({ _id: new ObjectId(roomId), status: 'waiting' });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'Aksi tidak valid.' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  }
}
