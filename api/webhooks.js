export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Verifikasi Webhook Secret dari environment Vercel
  const authHeader = req.headers['x-webhook-secret'] || req.headers.authorization;
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (expectedSecret && authHeader !== expectedSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized Webhook Request' });
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ success: false, error: 'DISCORD_WEBHOOK_URL belum dikonfigurasi di Environment Variables.' });
  }

  const { type, giveaway, winner, winners } = req.body;

  let payload = {};

  if (type === 'create') {
    payload = {
      content: `🎉 **EVENT GIVEAWAY BARU TELAH DIBUAT!** 🎉\nHost sedang membuat giveaway, jangan lupa cek websitenya!`,
      embeds: [
        {
          title: `🎁 ${giveaway.title}`,
          description: giveaway.description || 'Tidak ada deskripsi.',
          color: 0x5865F2,
          fields: [
            { name: '🏆 Hadiah', value: giveaway.prize, inline: true },
            { name: '👥 Pemenang', value: `${giveaway.winnersCount || 1} Orang`, inline: true }
          ],
          footer: { text: 'Rakan Aditya Community • Giveaway Panel' },
          timestamp: new Date().toISOString()
        }
      ]
    };
  } else if (type === 'roll_start') {
    payload = {
      content: `🎲 **Host sedang roll giveaway (manual)!**\nOtomatis dalam hitungan 10 detik giveaway akan berakhir!`
    };
  } else if (type === 'winner') {
    // Mendukung pemenang tunggal (winner) maupun banyak pemenang (winners array)
    const listWinners = winners && Array.isArray(winners) && winners.length > 0 
      ? winners 
      : (winner ? [winner] : []);

    const winnerMentions = listWinners.length > 0 
      ? listWinners.map(w => `<@${w.id}>`).join(', ') 
      : 'Peserta';

    const winnerNames = listWinners.length > 0 
      ? listWinners.map(w => `**${w.global_name || w.username}**`).join(', ') 
      : 'Peserta';

    payload = {
      content: `🎊 **Selamat Anda menang giveaway** ${winnerMentions}! 🎉\nHadiah: **${giveaway.prize}**`,
      embeds: [
        {
          title: `🏆 Pemenang Giveaway: ${giveaway.title}`,
          description: `Selamat kepada ${winnerNames} yang telah berhasil memenangkan **${giveaway.prize}**!`,
          color: 0x23A55A,
          thumbnail: {
            url: listWinners.length > 0 && listWinners[0].avatar 
              ? `https://cdn.discordapp.com/avatars/${listWinners[0].id}/${listWinners[0].avatar}.png`
              : 'https://cdn.discordapp.com/embed/avatars/0.png'
          },
          footer: { text: 'Rakan Aditya Community' },
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  try {
    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (discordRes.ok) {
      return res.status(200).json({ success: true, message: 'Webhook Discord berhasil terkirim.' });
    } else {
      const errText = await discordRes.text();
      return res.status(discordRes.status).json({ success: false, error: errText });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
