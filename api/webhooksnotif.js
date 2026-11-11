import { IncomingForm } from 'formidable';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Nonaktifkan body parser bawaan Next.js/Vercel untuk menangani multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

// Global cache sederhana untuk mencegah spam/duplikat dalam rentang waktu singkat (10 detik)
const recentClaims = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const webhookUrl = process.env.WEBHOOKS_NOTIF;
  if (!webhookUrl) {
    return res.status(500).json({ success: false, error: 'Webhook URL not configured' });
  }

  const form = new IncomingForm({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Gagal memproses form data' });
    }

    const giveawayId = Array.isArray(fields.giveawayId) ? fields.giveawayId[0] : fields.giveawayId;
    const discordUsername = Array.isArray(fields.discordUsername) ? fields.discordUsername[0] : fields.discordUsername;
    const discordId = Array.isArray(fields.discordId) ? fields.discordId[0] : fields.discordId;
    
    let user = null;
    try {
      const userStr = Array.isArray(fields.user) ? fields.user[0] : fields.user;
      user = JSON.parse(userStr);
    } catch (e) {}

    // --- PROTEKSI DUPLIKAT (ANTI-SPAM / DOUBLE SUBMIT) ---
    const claimKey = `${giveawayId}_${discordId}`;
    const now = Date.now();
    if (recentClaims.has(claimKey)) {
      const lastTime = recentClaims.get(claimKey);
      // Jika rentang waktu kurang dari 10 detik sejak klaim terakhir user ini, abaikan
      if (now - lastTime < 10000) {
        return res.status(200).json({ success: true, message: 'Klaim duplikat dicegah.' });
      }
    }
    recentClaims.set(claimKey, now);
    // Bersihkan memory cache lama secara berkala
    setTimeout(() => recentClaims.delete(claimKey), 15000);
    // ----------------------------------------------------

    const uploadedFile = files.proofFile ? (Array.isArray(files.proofFile) ? files.proofFile[0] : files.proofFile) : null;

    // Siapkan embed Discord
    const embed = {
      title: '🎁 Klaim Hadiah Giveaway Diterima!',
      color: 5763719, // Hijau Emerald
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

    const discordFormData = new FormData();
    
    if (uploadedFile) {
      embed.fields.push({ name: '📷 Status Bukti / Gambar', value: `✅ Mengirim gambar bukti: \`${uploadedFile.originalFilename || 'bukti.png'}\``, inline: false });
      embed.image = { url: `attachment://${uploadedFile.originalFilename || 'bukti.png'}` };
      
      discordFormData.append('file0', fs.createReadStream(uploadedFile.filepath), uploadedFile.originalFilename || 'bukti.png');
    } else {
      embed.fields.push({ name: '📷 Status Bukti / Gambar', value: '❌ User ini tidak mengirim gambar', inline: false });
    }

    discordFormData.append('payload_json', JSON.stringify({
      content: `📢 **Notifikasi Klaim Baru** dari <@${discordId}>!`,
      embeds: [embed]
    }));

    try {
      const discordResponse = await fetch(webhookUrl, {
        method: 'POST',
        body: discordFormData
      });

      if (!discordResponse.ok) {
        console.error('Gagal mengirim ke webhook Discord:', await discordResponse.text());
      }

      return res.status(200).json({ success: true, message: 'Notifikasi klaim berhasil dikirim' });
    } catch (err) {
      console.error('Error webhooksnotif:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });
}
