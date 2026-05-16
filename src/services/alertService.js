import { ObjectId } from "mongodb";
import { getDb } from "../lib/mongo.js";
import { log, safeErr } from "../lib/logger.js";
import { getPricesByCoinIds } from "./priceService.js";
import { formatUsd } from "../utils/format.js";

const ALERT_POLL_INTERVAL_MS = 60000;
const MAX_ACTIVE_ALERTS_PER_USER = 50;
let running = false;
let stopped = false;
let timer = null;
let lastMemoryLogAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

export async function createAlert({ telegramUserId, chatId, coin, direction, targetPrice }) {
  const normalizedDirection = String(direction || "").toLowerCase();
  const price = Number(targetPrice);

  if (!["above", "below"].includes(normalizedDirection)) {
    return { ok: false, reason: "direction" };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: "price" };
  }

  try {
    const activeCount = await getDb().collection("alerts").countDocuments({ telegramUserId, status: "active" });
    if (activeCount >= MAX_ACTIVE_ALERTS_PER_USER) {
      return { ok: false, reason: "limit" };
    }

    const now = new Date();
    const doc = {
      telegramUserId,
      chatId: String(chatId),
      coinId: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      direction: normalizedDirection,
      targetPrice: price,
      active: true,
      status: "active",
      triggeredAt: null,
      lastCheckedAt: null,
      lastObservedPrice: null,
      notificationStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const result = await getDb().collection("alerts").insertOne(doc);
    return { ok: true, alertId: String(result.insertedId), alert: { ...doc, _id: result.insertedId } };
  } catch (err) {
    log.error("db.write.failure", {
      collection: "alerts",
      operation: "insertOne",
      err: safeErr(err),
    });
    throw err;
  }
}

export async function listUserAlerts({ telegramUserId }) {
  try {
    return await getDb()
      .collection("alerts")
      .find({ telegramUserId, status: "active" })
      .sort({ createdAt: -1 })
      .toArray();
  } catch (err) {
    log.error("db.read.failure", {
      collection: "alerts",
      operation: "find",
      err: safeErr(err),
    });
    throw err;
  }
}

export async function removeAlert({ telegramUserId, alertId }) {
  const _id = toObjectId(alertId);
  if (!_id) return { ok: false, reason: "invalid" };

  try {
    const result = await getDb().collection("alerts").updateOne(
      { _id, telegramUserId, status: "active" },
      {
        $set: {
          active: false,
          status: "removed",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) return { ok: false, reason: "missing" };
    return { ok: true };
  } catch (err) {
    log.error("db.write.failure", {
      collection: "alerts",
      operation: "updateOne.remove",
      err: safeErr(err),
    });
    throw err;
  }
}

async function getActiveAlerts() {
  try {
    return await getDb()
      .collection("alerts")
      .find({ status: "active", active: true })
      .limit(2000)
      .toArray();
  } catch (err) {
    log.error("db.read.failure", {
      collection: "alerts",
      operation: "find.active",
      err: safeErr(err),
    });
    throw err;
  }
}

async function markTriggered(alert, currentPrice) {
  const now = new Date();

  try {
    const result = await getDb().collection("alerts").updateOne(
      { _id: alert._id, status: "active", active: true },
      {
        $set: {
          active: false,
          status: "triggered",
          triggeredAt: now,
          lastCheckedAt: now,
          lastObservedPrice: currentPrice,
          triggerPrice: currentPrice,
          notificationStatus: "sending",
          updatedAt: now,
        },
      }
    );

    if (result.modifiedCount !== 1) return false;

    await getDb().collection("alert_events").insertOne({
      alertId: String(alert._id),
      telegramUserId: alert.telegramUserId,
      coinId: alert.coinId,
      symbol: alert.symbol,
      direction: alert.direction,
      targetPrice: alert.targetPrice,
      observedPrice: currentPrice,
      eventType: "triggered",
      createdAt: now,
    });

    return true;
  } catch (err) {
    log.error("db.write.failure", {
      collection: "alerts",
      operation: "updateOne.trigger",
      err: safeErr(err),
    });
    throw err;
  }
}

async function updateNotificationStatus(alertId, status, err = "") {
  try {
    await getDb().collection("alerts").updateOne(
      { _id: alertId },
      {
        $set: {
          notificationStatus: status,
          notificationError: String(err || "").slice(0, 500),
          updatedAt: new Date(),
        },
      }
    );
  } catch (dbErr) {
    log.error("db.write.failure", {
      collection: "alerts",
      operation: "updateOne.notificationStatus",
      err: safeErr(dbErr),
    });
  }
}

function conditionMet(alert, currentPrice) {
  if (alert.direction === "above") return currentPrice >= Number(alert.targetPrice);
  if (alert.direction === "below") return currentPrice <= Number(alert.targetPrice);
  return false;
}

async function notify(api, alert, currentPrice) {
  const text = [
    "Crypto price alert triggered",
    `${String(alert.symbol).toUpperCase()} is now ${formatUsd(currentPrice)}`,
    `Condition: ${alert.direction} ${formatUsd(alert.targetPrice)}`,
    `Alert ID: ${String(alert._id)}`,
  ].join("\n");

  try {
    await api.sendMessage(alert.chatId, text);
    await updateNotificationStatus(alert._id, "sent");
  } catch (err) {
    log.error("telegram.send.failure", {
      feature: "alert_notification",
      alertId: String(alert._id),
      err: safeErr(err),
    });
    await updateNotificationStatus(alert._id, "failed", safeErr(err));
  }
}

async function runCycle(api) {
  log.info("alerts.poll.cycle");

  const now = Date.now();
  if (now - lastMemoryLogAt > 60000) {
    const m = process.memoryUsage();
    log.info("mem", {
      rssMB: Math.round(m.rss / 1e6),
      heapUsedMB: Math.round(m.heapUsed / 1e6),
    });
    lastMemoryLogAt = now;
  }

  const alerts = await getActiveAlerts();
  if (alerts.length === 0) return;

  const coinIds = [...new Set(alerts.map((alert) => alert.coinId).filter(Boolean))];
  let prices;

  try {
    prices = await getPricesByCoinIds(coinIds);
  } catch (err) {
    log.warn("alerts.poll.price_failure", { err: safeErr(err) });
    return;
  }

  for (const alert of alerts) {
    const price = prices.get(alert.coinId);
    if (!price || price.stale) continue;

    const currentPrice = Number(price.usd);
    if (!Number.isFinite(currentPrice)) continue;

    try {
      await getDb().collection("alerts").updateOne(
        { _id: alert._id, status: "active", active: true },
        {
          $set: {
            lastCheckedAt: new Date(),
            lastObservedPrice: currentPrice,
            updatedAt: new Date(),
          },
        }
      );

      if (!conditionMet(alert, currentPrice)) continue;

      const claimed = await markTriggered(alert, currentPrice);
      if (!claimed) continue;
      await notify(api, alert, currentPrice);
    } catch (err) {
      log.error("alerts.poll.alert_failure", {
        alertId: String(alert._id),
        err: safeErr(err),
      });
    }
  }
}

export function startAlertPolling(api) {
  if (running) return;
  running = true;
  stopped = false;
  log.info("alerts.poll.start", { intervalMs: ALERT_POLL_INTERVAL_MS });

  const loop = async () => {
    while (!stopped) {
      try {
        await runCycle(api);
      } catch (err) {
        log.error("alerts.poll.failure", { err: safeErr(err) });
      }

      if (!stopped) await sleep(ALERT_POLL_INTERVAL_MS);
    }
  };

  timer = loop();
}

export async function stopAlertPolling() {
  stopped = true;
  running = false;
  await timer;
  timer = null;
}
