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

    // Validasi keberadaan file bukti
    let proofStatusText = '❌ User ini tidak mengirim gambar';
    let imageEmbedField = null;

    if (fileData && fileType && fileType.startsWith('image/')) {
      proofStatusText = `✅ Mengirim gambar bukti: \`${fileName || 'bukti_klaim.png'}\``;
      
      // Jika Anda ingin menampilkan gambar secara langsung di Discord Embed (menggunakan base64 data URL secara langsung di batasan tertentu, atau menyertakannya di field)
      // Catatan: Discord Webhook JSON mentah tidak bisa langsung merender base64 string yang besar sebagai image URL utama tanpa di-upload ke CDN eksternal terlebih dahulu. 
      // Oleh karena itu, kita masukkan info detail file ke dalam embed field atau menyertakannya sebagai lampiran jika didukung.
    } else if (fileData) {
      proofStatusText = `📎 Mengirim file lampiran: \`${fileName || 'file'}\``;
    }

    // Format pesan embed Discord untuk notifikasi klaim
    const embed = {
      title: '🎁 Klaim Hadiah Giveaway Diterima!',
      color: 5763719, // Warna Hijau Emerald
      fields: [
        { name: '🆔 ID Giveaway', value: `\`${giveawayId}\``, inline: false },
        { name: '👤 Username Discord', value: `\`${discordUsername}\``, inline: true },
        { name: '🔑 Discord ID', value: `\`${discordId}\``, inline: true },
        { name: '📷 Status Bukti / Gambar', value: proofStatusText, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    if (user && user.id) {
      embed.footer = { text: `Diajukan oleh: ${user.global_name || user.username} (${user.id})` };
    }

    // Jika fileData berupa URL gambar publik (bukan base64 mentah yang terlalu panjang), bisa dimasukkan ke embed.image
    if (fileData && typeof fileData === 'string' && fileData.startsWith('http')) {
      embed.image = { url: fileData };
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
