import { MongoClient } from "mongodb";
import { log, safeErr } from "./logger.js";

let client = null;
let db = null;

export async function connectMongo(uri) {
  if (db) return db;

  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      ignoreUndefined: true,
    });

    await client.connect();
    db = client.db();
    log.info("db.connected", { mongodbUriSet: Boolean(uri) });
    await ensureIndexes();
    return db;
  } catch (err) {
    log.error("db.connect.failure", { err: safeErr(err) });
    throw err;
  }
}

export function getDb() {
  if (!db) throw new Error("MongoDB is not connected");
  return db;
}

export async function closeMongo() {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
  log.info("db.closed");
}

async function createIndex(collectionName, key, options = {}) {
  try {
    await getDb().collection(collectionName).createIndex(key, options);
  } catch (err) {
    log.error("db.index.failure", {
      collection: collectionName,
      operation: "createIndex",
      err: safeErr(err),
    });
    throw err;
  }
}

export async function ensureIndexes() {
  await createIndex("users", { telegramUserId: 1 }, { unique: true });
  await createIndex("watchlists", { telegramUserId: 1, coinId: 1 }, { unique: true });
  await createIndex("watchlists", { telegramUserId: 1 });
  await createIndex("alerts", { status: 1, coinId: 1 });
  await createIndex("alerts", { telegramUserId: 1, status: 1 });
  await createIndex("alerts", { active: 1, coinId: 1 });
  await createIndex("alert_events", { alertId: 1, createdAt: -1 });
}
