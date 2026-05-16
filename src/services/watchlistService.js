import { getDb } from "../lib/mongo.js";
import { log, safeErr } from "../lib/logger.js";

const MAX_WATCHLIST_COINS = 50;

export async function addWatchlistCoin({ telegramUserId, coin }) {
  try {
    const count = await getDb().collection("watchlists").countDocuments({ telegramUserId });
    if (count >= MAX_WATCHLIST_COINS) {
      return { ok: false, reason: "limit" };
    }

    const now = new Date();
    const mutable = {
      telegramUserId,
      coinId: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      updatedAt: now,
    };

    delete mutable._id;
    delete mutable.createdAt;

    await getDb().collection("watchlists").updateOne(
      { telegramUserId, coinId: coin.id },
      {
        $setOnInsert: { createdAt: now },
        $set: mutable,
      },
      { upsert: true }
    );

    return { ok: true };
  } catch (err) {
    log.error("db.write.failure", {
      collection: "watchlists",
      operation: "updateOne.upsert",
      err: safeErr(err),
    });
    throw err;
  }
}

export async function removeWatchlistCoin({ telegramUserId, coinId }) {
  try {
    const result = await getDb().collection("watchlists").deleteOne({ telegramUserId, coinId });
    return result.deletedCount > 0;
  } catch (err) {
    log.error("db.write.failure", {
      collection: "watchlists",
      operation: "deleteOne",
      err: safeErr(err),
    });
    throw err;
  }
}

export async function listWatchlist({ telegramUserId }) {
  try {
    return await getDb()
      .collection("watchlists")
      .find({ telegramUserId })
      .sort({ symbol: 1 })
      .toArray();
  } catch (err) {
    log.error("db.read.failure", {
      collection: "watchlists",
      operation: "find",
      err: safeErr(err),
    });
    throw err;
  }
}
