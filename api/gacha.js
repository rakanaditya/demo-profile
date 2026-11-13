import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

const DEFAULT_WAIFUS = [
  { id: 'lufas', name: 'LufasMapha', title: 'Black-Winged Sovereign', element: 'Dark', rarity: 'SSR', attack: 950, defense: 820, hp: 3200, image: '/Assets/Waifu/lufas.gif', description: 'Penguasa kegelapan bersayap hitam yang legendaris dengan kekuatan mutlak.' },
  { id: 'asuna', name: 'AsunaYuuki', title: 'The Lightning Flash', element: 'Light', rarity: 'SSR', attack: 910, defense: 700, hp: 2900, image: '/Assets/Waifu/asuna.gif', description: 'Pendekar pedang super cepat dari dunia Aincrad yang terkenal dengan tusukan kilatnya.' },
  { id: 'zero_two', name: 'Zero Two', title: 'Partner Killer', element: 'Fire', rarity: 'SSR', attack: 930, defense: 680, hp: 3100, image: '/Assets/Waifu/zerotwo.gif', description: 'Gadis bertanduk dengan darah klakosaur di nadinya, petarung Franxx yang buas.' },
  { id: 'mikhail', name: 'Mikhail', title: 'The Case Study Of Vanitas', element: 'Shadow', rarity: 'SSR', attack: 960, defense: 750, hp: 3300, image: '/Assets/Waifu/vanitasmikhail.gif', description: 'Seorang manusia biasa yang mengaku sebagai dokter spesialis vampir.' },
  { id: 'rem', name: 'Rem', title: 'The Maid of Oni', element: 'Water', rarity: 'SR', attack: 780, defense: 750, hp: 2800, image: '/Assets/Waifu/rem.gif', description: 'Pelayan setia dari Roswaal Mansion.' },
  { id: 'kasane', name: 'KasaneTeto', title: 'Virtual Diva', element: 'Fire', rarity: 'SR', attack: 750, defense: 700, hp: 3400, image: '/Assets/Waifu/kasane.gif', description: 'Chimera chimera berambut drill merah.' },
  { id: 'senko', name: 'Senkosan', title: 'The Helpful Fox', element: 'Wind', rarity: 'SR', attack: 720, defense: 730, hp: 2900, image: '/Assets/Waifu/senko.gif', description: 'Rubah dewa berusia 800 tahun.' },
  { id: 'nanahiragi', name: 'NanaHiiragi', title: 'Talentless Strategist', element: 'Dark', rarity: 'SR', attack: 760, defense: 690, hp: 2700, image: '/Assets/Waifu/nanahiragi.gif', description: 'Gadis cerdas berwajah polos.' },
  { id: 'emilia', name: 'Emilia', title: 'Half-Elf Candidate', element: 'Ice', rarity: 'SR', attack: 770, defense: 760, hp: 3000, image: '/Assets/Waifu/emilia.gif', description: 'Kandidat calon penguasa kerajaan Lugnica.' },
  { id: 'miku', name: 'HatsuneMiku', title: 'Virtual Diva', element: 'Wind', rarity: 'R', attack: 650, defense: 600, hp: 2400, image: '/Assets/Waifu/miku.gif', description: 'Idola virtual bersuara kian merdu.' },
  { id: 'aqua', name: 'Aqua', title: 'Useless Goddess', element: 'Water', rarity: 'R', attack: 620, defense: 650, hp: 2600, image: '/Assets/Waifu/aqua.gif', description: 'Dewi air yang sering bikin rewel.' },
  { id: 'megumin', name: 'Megumin', title: 'Explosion Archwizard', element: 'Fire', rarity: 'R', attack: 700, defense: 500, hp: 2100, image: '/Assets/Waifu/megumin.gif', description: 'Penyihir jenius sihir Ledakan.' }
];

export default async function handler(req, res) {
  const { db } = await connectToDatabase();
  const usersCollection = db.collection('waifu_users');
  const waifusCollection = db.collection('waifus');
  const pvpRoomsCollection = db.collection('pvp_rooms');

  for (const defaultWaifu of DEFAULT_WAIFUS) {
    await waifusCollection.updateOne(
      { id: defaultWaifu.id },
      { $set: defaultWaifu },
      { upsert: true }
    );
  }

  // PENANGANAN METHOD GET
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
          pityCounter: 0,
          createdAt: new Date()
        };
        await usersCollection.insertOne(dbUser);
      }
      
      const allWaifus = await waifusCollection.find({}).toArray();
      const openRooms = await pvpRoomsCollection.find({ status: 'waiting', 'player1.id': { $ne: id } }).toArray();

      return res.status(200).json({ success: true, user: dbUser, waifus: allWaifus, openRooms });
    }

    if (getAction === 'check_room') {
      try {
        if (!roomId || roomId.length !== 24) return res.status(200).json({ success: true, room: null });
        const room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        return res.status(200).json({ success: true, room });
      } catch (err) {
        return res.status(200).json({ success: true, room: null });
      }
    }

    if (getAction === 'get_open_rooms') {
      const openRooms = await pvpRoomsCollection.find({ status: 'waiting', 'player1.id': { $ne: id } }).toArray();
      return res.status(200).json({ success: true, openRooms });
    }

    if (getAction === 'online_users') {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const onlineUsers = await usersCollection.find(
        { lastActive: { $gte: fiveMinutesAgo } }
      ).project({ id: 1, username: 1, global_name: 1, avatar: 1 }).toArray();

      return res.status(200).json({ success: true, onlineUsers });
    }

    if (getAction === 'leaderboard') {
      const topPoints = await usersCollection.find({}).sort({ points: -1 }).limit(10).project({ id: 1, username: 1, global_name: 1, avatar: 1, points: 1 }).toArray();
      const topStreak = await usersCollection.find({}).sort({ loginStreak: -1, points: -1 }).limit(10).project({ id: 1, username: 1, global_name: 1, avatar: 1, loginStreak: 1 }).toArray();
      
      const allUsers = await usersCollection.find({}).toArray();
      
      const topInventory = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        global_name: u.global_name,
        avatar: u.avatar,
        inventoryCount: u.inventory ? u.inventory.length : 0
      })).sort((a, b) => b.inventoryCount - a.inventoryCount).slice(0, 10);

      const topPvP = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        global_name: u.global_name,
        avatar: u.avatar,
        pvpWins: u.pvpWins || 0,
        pvpLosses: u.pvpLosses || 0
      })).sort((a, b) => b.pvpWins - a.pvpWins).slice(0, 10);

      const topGacha = allUsers.map(u => {
        const totalDupes = (u.inventory || []).reduce((sum, item) => sum + (item.dupes || 1), 0);
        const totalSummons = (u.gachaCount || 0) + totalDupes;
        return {
          id: u.id,
          username: u.username,
          global_name: u.global_name,
          avatar: u.avatar,
          gachaCount: totalSummons
        };
      }).sort((a, b) => b.gachaCount - a.gachaCount).slice(0, 10);

      return res.status(200).json({
        success: true,
        leaderboard: {
          points: topPoints,
          streak: topStreak,
          inventory: topInventory,
          pvp: topPvP,
          gacha: topGacha
        }
      });
    }

    const allWaifus = await waifusCollection.find({}).toArray();
    return res.status(200).json({ success: true, waifus: allWaifus });
  }

  // PENANGANAN METHOD POST
  if (req.method === 'POST') {
    try {
      const { action, userId, user } = req.body;

      if (action === 'heartbeat') {
        if (!userId) return res.status(400).json({ success: false, error: 'User ID diperlukan.' });
        await usersCollection.updateOne(
          { id: userId },
          { $set: { lastActive: new Date() } }
        );
        return res.status(200).json({ success: true });
      }

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
          pityCounter: 0,
          createdAt: new Date()
        };
        await usersCollection.insertOne(dbUser);
      }

      if (!dbUser) return res.status(404).json({ success: false, error: 'User tidak ditemukan.' });

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

      if (action === 'gacha') {
        const gachaCost = 50;
        if (dbUser.points < gachaCost) {
          return res.status(400).json({ success: false, error: 'Poin Anda tidak cukup!' });
        }

        const allWaifus = await waifusCollection.find({}).toArray();
        let pityCounter = dbUser.pityCounter || 0;
        pityCounter++;

        const rand = Math.random() * 300;
        let targetRarity = 'R';

        if (pityCounter >= 200) {
          targetRarity = 'SSR';
          pityCounter = 0;
        } else {
          if (rand < 5) {
            targetRarity = 'SSR';
            pityCounter = 0;
          } else if (rand < 30) {
            targetRarity = 'SR';
          } else {
            targetRarity = 'R';
          }
        }

        let pool = allWaifus.filter(w => w.rarity === targetRarity);
        if (pool.length === 0) pool = allWaifus;

        const pulledWaifu = pool[Math.floor(Math.random() * pool.length)];
        const newPoints = dbUser.points - gachaCost;

        let inventory = dbUser.inventory || [];
        let existingIndex = inventory.findIndex(item => item.waifuId === pulledWaifu.id);

        let isNewCharacter = false;
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
          isNewCharacter = true;
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
          { $set: { points: newPoints, inventory: inventory, pityCounter: pityCounter }, $inc: { gachaCount: 1 } }
        );

        return res.status(200).json({
          success: true,
          isDuplicate: !isNewCharacter,
          isNewUnlocked: isNewCharacter,
          pityCounter: pityCounter,
          message: isNewCharacter ? `✨ NEW UNLOCKED! Mendapatkan ${pulledWaifu.name}!` : `Duplikat! ${pulledWaifu.name} digabungkan.`,
          waifu: updatedItem,
          points: newPoints
        });
      }

      if (action === 'delete_waifu') {
        const { instanceId } = req.body;
        let inventory = dbUser.inventory || [];
        inventory = inventory.filter(item => item.instanceId !== instanceId);
        await usersCollection.updateOne({ id: userId }, { $set: { inventory } });
        return res.status(200).json({ success: true, inventory });
      }

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
        await usersCollection.updateOne({ id: userId }, { $set: { inventory: newInventory } });
        return res.status(200).json({ success: true, inventory: newInventory, message: 'Berhasil merge duplikat!' });
      }

      if (action === 'create_pvp_room') {
        const { instanceId, isBot } = req.body;
        const waifu = (dbUser.inventory || []).find(i => i.instanceId === instanceId);
        if (!waifu) return res.status(400).json({ success: false, error: 'Waifu tidak ditemukan.' });

        await pvpRoomsCollection.deleteMany({
          $or: [
            { 'player1.id': userId, status: { $in: ['waiting', 'battling', 'finished'] } },
            { 'player2.id': userId, status: { $in: ['waiting', 'battling', 'finished'] } }
          ]
        });

        let player2Data = null;
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
        }

        const newRoom = {
          status: 'waiting',
          player1: {
            id: dbUser.id,
            name: dbUser.global_name || dbUser.username,
            avatar: dbUser.avatar,
            waifu: { ...waifu, currentHp: waifu.currentHp ?? waifu.hp },
            currentHp: waifu.currentHp ?? waifu.hp,
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

      if (action === 'join_pvp_room') {
        const { roomId, instanceId } = req.body;
        if (!roomId || roomId.length !== 24) return res.status(400).json({ success: false, error: 'Room ID tidak valid.' });
        const waifu = (dbUser.inventory || []).find(i => i.instanceId === instanceId);
        if (!waifu) return res.status(400).json({ success: false, error: 'Waifu tidak ditemukan.' });

        const player2Data = {
          id: dbUser.id,
          name: dbUser.global_name || dbUser.username,
          avatar: dbUser.avatar,
          waifu: { ...waifu, currentHp: waifu.currentHp ?? waifu.hp },
          currentHp: waifu.currentHp ?? waifu.hp,
          maxHp: waifu.hp,
          ready: false
        };

        await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $set: { player2: player2Data } });
        return res.status(200).json({ success: true, roomId });
      }

      if (action === 'player_ready') {
        const { roomId } = req.body;
        if (!roomId || roomId.length !== 24) return res.status(400).json({ success: false, error: 'Room ID tidak valid.' });
        
        let room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        if (!room) return res.status(400).json({ success: false, error: 'Room tidak ditemukan.' });

        let updateField = {};
        if (room.player1 && room.player1.id === userId) updateField['player1.ready'] = true;
        else if (room.player2 && room.player2.id === userId) updateField['player2.ready'] = true;

        if (room.player2 && room.player2.id === 'bot_ai') updateField['player2.ready'] = true;

        await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $set: updateField });

        let updatedRoom = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
        
        if (updatedRoom.player1?.ready && updatedRoom.player2?.ready) {
          await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { 
            $set: { 
              status: 'battling', 
              logs: [], 
              winner: null,
              'player1.currentHp': updatedRoom.player1.maxHp,
              'player2.currentHp': updatedRoom.player2.maxHp,
              'player1.ready': false,
              'player2.ready': false
            } 
          });
        }

        return res.status(200).json({ success: true });
      }

      if (action === 'get_pvp_status') {
        try {
          const { roomId } = req.body;
          if (!roomId || roomId.length !== 24) return res.status(400).json({ success: false, error: 'Room ID tidak valid.' });
          
          let room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
          if (!room) return res.status(400).json({ success: false, error: 'Room tidak ditemukan.' });

          if (room.status === 'battling' && (!room.logs || room.logs.length === 0)) {
            let p1Hp = room.player1.currentHp ?? room.player1.maxHp;
            let p2Hp = room.player2.currentHp ?? room.player2.maxHp;
            const p1W = room.player1.waifu;
            const p2W = room.player2.waifu;
            let logs = [];

            let turn = 1;
            while (p1Hp > 0 && p2Hp > 0 && turn <= 10) {
              let p1Damage = Math.max(15, Math.round(p1W.attack * (Math.random() * 0.3 + 0.85) - (p2W.defense || 0) * 0.25));
              p2Hp = Math.max(0, p2Hp - p1Damage);
              logs.push({ turn, attacker: room.player1.name, defender: room.player2.name, damage: p1Damage, p2Hp, p1Hp });
              if (p2Hp <= 0) break;

              let p2Damage = Math.max(15, Math.round(p2W.attack * (Math.random() * 0.3 + 0.85) - (p1W.defense || 0) * 0.25));
              p1Hp = Math.max(0, p1Hp - p2Damage);
              logs.push({ turn, attacker: room.player2.name, defender: room.player1.name, damage: p2Damage, p2Hp, p1Hp });
              turn++;
            }

            let winner = p1Hp > p2Hp ? room.player1.name : (p2Hp > p1Hp ? room.player2.name : 'Draw');
            
            let updateData = { 
              status: 'finished', 
              logs, 
              winner, 
              'player1.currentHp': p1Hp, 
              'player2.currentHp': p2Hp,
              'player1.ready': false,
              'player2.ready': false
            };

            if (room.player2 && room.player2.id === 'bot_ai' && p2Hp <= 0) {
              const allWaifus = await waifusCollection.find({}).toArray();
              const randBotWaifu = allWaifus[Math.floor(Math.random() * allWaifus.length)];
              updateData['player2'] = {
                id: 'bot_ai',
                name: `[Bot] ${randBotWaifu.name}`,
                avatar: '',
                waifu: { ...randBotWaifu, instanceId: 'bot_inst', dupes: 1 },
                currentHp: randBotWaifu.hp,
                maxHp: randBotWaifu.hp,
                ready: true
              };
            }

            await pvpRoomsCollection.updateOne({ _id: new ObjectId(roomId) }, { $set: updateData });

            if (winner !== 'Draw') {
              const winningPlayerId = winner === room.player1.name ? room.player1.id : room.player2?.id;
              const losingPlayerId = winner === room.player1.name ? room.player2?.id : room.player1.id;
              const isAgainstBot = room.player2?.id === 'bot_ai';

              if (winningPlayerId && winningPlayerId !== 'bot_ai') {
                const rewardPoints = isAgainstBot ? 200 : 500;
                await usersCollection.updateOne({ id: winningPlayerId }, { $inc: { pvpWins: 1, points: rewardPoints } });
              }
              if (losingPlayerId && losingPlayerId !== 'bot_ai') {
                await usersCollection.updateOne({ id: losingPlayerId }, { $inc: { pvpLosses: 1 } });
              }
            }
          }

          room = await pvpRoomsCollection.findOne({ _id: new ObjectId(roomId) });
          return res.status(200).json({ success: true, room });
        } catch (err) {
          return res.status(500).json({ success: false, error: err.message });
        }
      }

      if (action === 'leave_room') {
        const { roomId } = req.body;
        if (roomId && roomId.length === 24) {
          await pvpRoomsCollection.deleteOne({ _id: new ObjectId(roomId) });
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'Aksi POST tidak valid.' });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  }
}
