import { connectToDatabase } from './db.js';

export default async function handler(req, res) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('ratings');

    // GET: Ambil daftar ulasan & statistik rata-rata
    if (req.method === 'GET') {
      const ratings = await collection.find({}).sort({ createdAt: -1 }).toArray();
      const total = ratings.length;
      const average = total > 0 ? (ratings.reduce((acc, curr) => acc + curr.rating, 0) / total).toFixed(1) : 0;

      return res.status(200).json({ success: true, ratings, stats: { total, average } });
    }

    // POST: Simpan ulasan baru
    if (req.method === 'POST') {
      const { userId, username, avatar, discriminator, rating, comment, reaction } = req.body;

      if (!userId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Data user atau rating bintang (1-5) tidak valid.' });
      }

      const avatarUrl = avatar 
        ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${(discriminator || 0) % 5}.png`;

      const newReview = {
        userId,
        username: username || 'Discord User',
        avatar: avatarUrl,
        rating: Number(rating),
        comment: comment ? comment.trim() : '',
        reaction: reaction || '⭐',
        createdAt: new Date(),
      };

      await collection.insertOne(newReview);
      return res.status(201).json({ success: true, message: 'Ulasan berhasil dikirim!' });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
