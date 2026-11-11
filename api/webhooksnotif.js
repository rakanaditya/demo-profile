export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { giveawayId, discordUsername, discordId, fileData, fileName, fileType, user } = req.body;
    const webhookUrl = process.env.WEBHOOKS_NOTIF;

    if (!webhookUrl) {
      return res.status(500).json({ success: false, error: 'Webhook URL not configured' });
    }

    // Format pesan embed Discord untuk notifikasi klaim
    const embed = {
      title: '🎁 Klaim Hadiah Giveaway Diterima!',
      color: 5763719, // Warna Hijau Emerald
      fields: [
        { name: '🆔 ID Giveaway', value: `\`${giveawayId}\``, inline: false },
        { name: '👤 Username Discord', value: `\`${discordUsername}\``, inline: true },
        { name: '🔑 Discord ID', value: `\`${discordId}\``, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    if (user && user.id) {
      embed.footer = { text: `Diajukan oleh: ${user.global_name || user.username} (${user.id})` };
    }

    // Kirim payload ke webhook Discord
    const discordPayload = {
      content: `📢 **Notifikasi Klaim Baru** dari <@${discordId}>!`,
      embeds: [embed]
    };

    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (!discordResponse.ok) {
      console.error('Gagal mengirim ke webhook Discord:', await discordResponse.text());
    }

    return res.status(200).json({ success: true, message: 'Notifikasi klaim berhasil dikirim' });
  } catch (err) {
    console.error('Error webhooksnotif:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
