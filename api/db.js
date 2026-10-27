// api/db.js
import { MongoClient } from 'mongodb';

const MONGO_USER = process.env.MONGO_USER;
const MONGO_PASSWORD = process.env.MONGO_USER_PASSWORD;
const MONGO_CLUSTER = process.env.MONGO_CLUSTER || 'cluster0.mongodb.net'; // Sesuaikan cluster name Anda di Vercel jika berbeda

const uri = `mongodb+srv://${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(MONGO_PASSWORD)}@${MONGO_CLUSTER}/?retryWrites=true&w=majority`;

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(uri);
  const db = client.db('discord_db');

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}
