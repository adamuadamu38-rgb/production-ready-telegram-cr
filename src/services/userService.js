import { getDb } from "../lib/mongo.js";
import { log, safeErr } from "../lib/logger.js";

export async function upsertUserFromCtx(ctx) {
  if (!ctx.from) return;

  const now = new Date();
  const telegramUserId = String(ctx.from.id);
  const mutable = {
    telegramUserId,
    chatId: ctx.chat?.id ? String(ctx.chat.id) : "",
    username: ctx.from.username || "",
    firstName: ctx.from.first_name || "",
    languageCode: ctx.from.language_code || "",
    lastSeenAt: now,
    updatedAt: now,
  };

  delete mutable._id;
  delete mutable.createdAt;

  try {
    await getDb().collection("users").updateOne(
      { telegramUserId },
      {
        $setOnInsert: { createdAt: now },
        $set: mutable,
      },
      { upsert: true }
    );
  } catch (err) {
    log.error("db.write.failure", {
      collection: "users",
      operation: "updateOne.upsert",
      err: safeErr(err),
    });
    throw err;
  }
}
