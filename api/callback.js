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

    // 2. Ambil data profil user dari API Discord v10
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    // 3. TARIK BIO RESMI dari Endpoint Profile Discord
    try {
      const profileResponse = await fetch(`https://discord.com/api/v10/users/${userData.id}/profile`, {
        headers: {
          Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
        },
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        // Ekstrak data bio jika tersedia
        if (profileData.user_profile && profileData.user_profile.bio) {
          userData.bio = profileData.user_profile.bio;
        } else if (profileData.bio) {
          userData.bio = profileData.bio;
        }
      }
    } catch (profileErr) {
      console.log("Endpoint profile v10 tidak dapat dijangkau, menggunakan fallback.");
    }

    // 4. Simpan / Perbarui Data User ke MongoDB Atlas
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

    // 5. Redirect ke index.html membawa data user (Termasuk BIO)
    const encodedUserData = encodeURIComponent(JSON.stringify(userData));
    return res.redirect(`/?user=${encodedUserData}`);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
