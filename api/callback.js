// api/callback.js
import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/');
  }

  const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

  try {
    // 1. Tukar authorization code dengan access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json(tokenData);
    }

    // 2. Ambil data profil user dari API Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    // 3. Simpan / Perbarui Data User ke MongoDB
    try {
      const { db } = await connectToDatabase();
      const usersCollection = db.collection('users');

      await usersCollection.updateOne(
        { id: userData.id },
        { 
          $set: {
            ...userData,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            last_login: new Date()
          } 
        },
        { upsert: true }
      );
    } catch (dbError) {
      console.error("Gagal menyimpan ke MongoDB:", dbError.message);
    }

    // 4. Redirect kembali ke index.html membawa data user
    const encodedUserData = encodeURIComponent(JSON.stringify(userData));
    return res.redirect(`/?user=${encodedUserData}`);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
