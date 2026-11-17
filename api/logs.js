// api/logs.js
import { connectToDatabase } from './db.js';

function extractClusterHost(mongoUri = '') {
  try {
    const match = mongoUri.match(/@([^/?]+)/);
    return match ? match[1].split('.')[0] : 'atlas-cluster';
  } catch {
    return 'atlas-cluster';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // =========================================================================
  // MODE 1: SYSTEM STATUS & VISITOR ANALYTICS (/api/logs?type=status)
  // =========================================================================
  if (req.query?.type === 'status') {
    const reqStart = Date.now();
    const visitorId =
      req.query?.vid ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'anonymous';

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);

    let mongoStatus = {
      online: false,
      latencyMs: null,
      cluster: extractClusterHost(process.env.MONGODB_URI || process.env.MONGODB_URI_WEB || ''),
      error: null,
    };

    let visitorStats = {
      onlineNow: 1,
      todayViews: 1,
      totalUniqueVisitors: 1,
    };

    try {
      const dbStart = Date.now();
      const { db } = await connectToDatabase();
      await db.command({ ping: 1 });
      mongoStatus.online = true;
      mongoStatus.latencyMs = Date.now() - dbStart;

      // Deteksi & simpan pengunjung web di MongoDB
      const visitorsCol = db.collection('web_visitors');
      const dailyCol = db.collection('web_daily_hits');

      await visitorsCol.updateOne(
        { visitorId },
        {
          $set: {
            lastSeen: now,
            userAgent: (req.headers['user-agent'] || '').slice(0, 120),
          },
          $setOnInsert: { firstSeen: now },
          $inc: { visits: 1 },
        },
        { upsert: true }
      );

      if (req.query?.track === '1') {
        await dailyCol.updateOne(
          { date: todayStr },
          { $inc: { hits: 1 } },
          { upsert: true }
        );
      }

      const [onlineNow, totalUnique, todayDoc] = await Promise.all([
        visitorsCol.countDocuments({ lastSeen: { $gte: fiveMinutesAgo } }),
        visitorsCol.countDocuments({}),
        dailyCol.findOne({ date: todayStr }),
      ]);

      visitorStats = {
        onlineNow: Math.max(1, onlineNow),
        todayViews: todayDoc?.hits || 1,
        totalUniqueVisitors: Math.max(1, totalUnique),
      };
    } catch (error) {
      mongoStatus.online = false;
      mongoStatus.error = error.message;
    }

    return res.status(200).json({
      success: mongoStatus.online,
      ok: mongoStatus.online,
      timestamp: now.toISOString(),
      mongodb: mongoStatus,
      vercel: {
        online: true,
        region: process.env.VERCEL_REGION || 'sin1 (Singapore)',
        latencyMs: Date.now() - reqStart,
        nodeVersion: process.version,
      },
      visitors: visitorStats,
    });
  }

  // =========================================================================
  // MODE 2: DEFAULT ACTIVITY LOG USERS (/api/logs)
  // =========================================================================
  try {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    const users = await usersCollection
      .find({})
      .sort({ last_login: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error('Gagal mengambil log user dari MongoDB:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
