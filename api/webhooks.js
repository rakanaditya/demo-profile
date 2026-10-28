// api/webhooks.js
import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { type, giveaway, winners } = req.body;
  const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  if (!DISCORD_WEBHOOK_URL) {
    return res.status(500).json({ success: false, error: 'Webhook URL tidak dikonfigurasi.' });
  }

  const { db } = await connectToDatabase();
  const collection = db.collection('giveaways');

  // 🔍 VALIDASI CEK DUPLIKASI PESAN DENGAN DATABASE
  if (giveaway && giveaway._id) {
    const existingGw = await collection.findOne({ _id: new ObjectId(giveaway._id) });

    if (existingGw) {
      // 1. Cegah kirim ganda untuk pesan WINNER
      if (type === 'winner' && existingGw.webhookWinnerSent) {
        return res.status(200).json({ success: true, message: 'Webhook pemenang sudah dikirim sebelumnya.' });
      }

      // 2. Cegah kirim ganda untuk pesan ROLL_AUTO (Waktu Habis)
      if (type === 'roll_auto' && existingGw.webhookAutoRollSent) {
        return res.status(200).json({ success: true, message: 'Webhook roll otomatis sudah dikirim sebelumnya.' });
      }

      // 3. Cegah kirim ganda untuk pesan ROLL_START (Roll Manual Host)
      if (type === 'roll_start' && existingGw.webhookManualRollSent) {
        return res.status(200).json({ success: true, message: 'Webhook roll manual sudah dikirim sebelumnya.' });
      }
    }
  }

  let payload = {};

  if (type === 'create') {
    payload = {
      embeds: [{
        title: `🎁 Giveaway Baru ${giveaway.title}`,
        url: 'https://demo-profile-dun.vercel.app/giveaway',
        description: `${giveaway.description || 'Tidak ada deskripsi.'}\n\n**🎁 Hadiah:** ${giveaway.prize}\n**🏆 Jumlah Pemenang:** ${giveaway.winnersCount || 1}`,
        thumbnail: { url: 'https://i.imgur.com/XDLY64r.mp4',},
        color: 0x5865F2,
        footer: { text: "Rakan Aditya Community • Giveaway System" },
        timestamp: new Date()
      }]
    };
  } else if (type === 'roll_start') {
    payload = {
      content: `🎲 **Host sedang mengocok giveaway (Manual)!**\nPengumuman pemenang akan keluar sebentar lagi!`
    };
  } else if (type === 'roll_auto') {
    payload = {
      content: `🎲 **Waktu Habis! Giveaway sedang di-roll secara otomatis!**\nSistem sedang menentukan pemenang secara acak...`
    };
  } else if (type === 'winner') {
    const winnerMentions = winners ? winners.map(w => `<@${w.id}>`).join(', ') : '';
    const winnerNames = winners ? winners.map(w => w.global_name || w.username).join(', ') : '';

    payload = {
      content: `🎉 **SELAMAT KEPADA PEMENANG!** 🎉\n${winnerMentions}`,
      embeds: [{
        title: `🏆 Pemenang Giveaway: ${giveaway.title}`,
        description: `**🎁 Hadiah:** ${giveaway.prize}\n**👑 Pemenang:** ${winnerNames}`,
        color: 0x57F287,
        thumbnail: {
          url: winners && winners[0]?.avatar 
            ? `https://cdn.discordapp.com/avatars/${winners[0].id}/${winners[0].avatar}.png`
            : 'https://cdn.discordapp.com/embed/avatars/0.png'
        },
        footer: { text: "Rakan Aditya Community • Official Winner Announcement" },
        timestamp: new Date()
      }]
    };
  }

  try {
    const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (discordRes.ok) {
      // 📝 TANDAI DI DATABASE SETELAH BERHASIL DIKIRIM KE DISCORD
      if (giveaway && giveaway._id) {
        let updateField = {};
        if (type === 'winner') updateField = { webhookWinnerSent: true };
        if (type === 'roll_auto') updateField = { webhookAutoRollSent: true };
        if (type === 'roll_start') updateField = { webhookManualRollSent: true };

        if (Object.keys(updateField).length > 0) {
          await collection.updateOne(
            { _id: new ObjectId(giveaway._id) },
            { $set: updateField }
          );
        }
      }

      return res.status(200).json({ success: true, message: 'Webhook terkirim.' });
    } else {
      return res.status(500).json({ success: false, error: 'Gagal mengirim ke Discord Webhook.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
