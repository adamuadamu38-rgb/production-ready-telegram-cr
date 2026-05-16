import { Bot } from "grammy";
import { upsertUserFromCtx } from "./services/userService.js";
import { removeWatchlistCoin } from "./services/watchlistService.js";
import { resolveCoin, SymbolNotFoundError, SymbolAmbiguousError } from "./services/priceService.js";
import { createAlert, removeAlert } from "./services/alertService.js";
import { sendPriceReply } from "./commands/price.js";
import { sendWatchlist } from "./commands/watchlist.js";
import { sendAlerts } from "./commands/alerts.js";
import { HELP_TEXT } from "./commands/help.js";
import { alertDirectionKeyboard, mainMenuKeyboard } from "./utils/keyboards.js";
import { formatUsd } from "./utils/format.js";
import { log, safeErr } from "./lib/logger.js";

const pendingAlerts = new Map();
const PENDING_ALERT_TTL_MS = 5 * 60 * 1000;

function pendingKey(ctx) {
  return String(ctx.from?.id || "");
}

function cleanPendingAlerts() {
  const now = Date.now();
  for (const [key, value] of pendingAlerts.entries()) {
    if (!value || value.expiresAt <= now) pendingAlerts.delete(key);
  }
}

async function safeAnswerCallback(ctx, text = "") {
  try {
    await ctx.answerCallbackQuery(text ? { text } : undefined);
  } catch (err) {
    log.warn("telegram.callback_answer.failure", { err: safeErr(err) });
  }
}

export function createBot(token) {
  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    try {
      if (ctx.from) await upsertUserFromCtx(ctx);
    } catch {
      if (ctx.message) {
        await ctx.reply("The database is temporarily unavailable. Please try again in a minute.");
        return;
      }
    }

    await next();
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data || "";
    cleanPendingAlerts();

    try {
      if (data === "menu:help") {
        await safeAnswerCallback(ctx);
        await ctx.reply(HELP_TEXT);
        return;
      }

      if (data === "menu:price") {
        await safeAnswerCallback(ctx);
        await ctx.reply("Send a symbol like this: /price btc");
        return;
      }

      if (data === "menu:addcoin") {
        await safeAnswerCallback(ctx);
        await ctx.reply("Add a coin with /addcoin btc");
        return;
      }

      if (data === "menu:alert") {
        await safeAnswerCallback(ctx);
        await ctx.reply("Create an alert with /alert btc above 70000 or /alert eth below 2500.");
        return;
      }

      if (data === "menu:watchlist") {
        await safeAnswerCallback(ctx);
        await sendWatchlist(ctx);
        return;
      }

      if (data.startsWith("price:refresh:")) {
        const symbol = data.split(":")[2];
        await safeAnswerCallback(ctx, "Refreshing price");
        await sendPriceReply(ctx, symbol, true);
        return;
      }

      if (data.startsWith("wl:remove:")) {
        const coinId = data.slice("wl:remove:".length);
        await safeAnswerCallback(ctx);
        const removed = await removeWatchlistCoin({
          telegramUserId: String(ctx.from.id),
          coinId,
        });

        if (!removed) {
          await ctx.reply("That watchlist action is stale. The coin is already removed or no longer exists.");
          return;
        }

        await ctx.reply("Coin removed from your watchlist.");
        return;
      }

      if (data.startsWith("alert:start:")) {
        const symbol = data.split(":")[2];
        await safeAnswerCallback(ctx);
        await ctx.reply(`Choose alert direction for ${symbol.toUpperCase()}.`, {
          reply_markup: alertDirectionKeyboard(symbol),
        });
        return;
      }

      if (data.startsWith("alert:dir:")) {
        const [, , symbol, direction] = data.split(":");
        await safeAnswerCallback(ctx);

        try {
          const coin = await resolveCoin(symbol);
          pendingAlerts.set(pendingKey(ctx), {
            coin,
            direction,
            expiresAt: Date.now() + PENDING_ALERT_TTL_MS,
          });

          await ctx.reply(`Send the target price for ${coin.symbol.toUpperCase()} ${direction}. Example: 70000`);
        } catch (err) {
          if (err instanceof SymbolNotFoundError || err instanceof SymbolAmbiguousError) {
            await ctx.reply("That alert action is stale. Please run /price again and use the new button.");
            return;
          }
          throw err;
        }
        return;
      }

      if (data === "alert:cancel") {
        pendingAlerts.delete(pendingKey(ctx));
        await safeAnswerCallback(ctx, "Canceled");
        await ctx.reply("Alert setup canceled.");
        return;
      }

      if (data.startsWith("alert:remove:")) {
        const alertId = data.slice("alert:remove:".length);
        await safeAnswerCallback(ctx);
        const result = await removeAlert({
          telegramUserId: String(ctx.from.id),
          alertId,
        });

        if (!result.ok) {
          await ctx.reply("That alert action is stale. The alert was already removed or no longer exists.");
          return;
        }

        await ctx.reply("Alert removed.");
        return;
      }

      if (data === "menu:alerts") {
        await safeAnswerCallback(ctx);
        await sendAlerts(ctx);
        return;
      }

      await safeAnswerCallback(ctx, "This button is no longer valid.");
    } catch (err) {
      log.error("callback.failure", { data, err: safeErr(err) });
      await safeAnswerCallback(ctx, "Please try again in a minute.");
    }
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message?.text || "";
    if (text.startsWith("/")) return next();

    cleanPendingAlerts();
    const state = pendingAlerts.get(pendingKey(ctx));
    if (!state) return next();

    const targetPrice = Number(text.trim().replace(/,/g, ""));
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      await ctx.reply("Please send a valid positive target price. Example: 70000");
      return;
    }

    try {
      const result = await createAlert({
        telegramUserId: String(ctx.from.id),
        chatId: String(ctx.chat.id),
        coin: state.coin,
        direction: state.direction,
        targetPrice,
      });

      pendingAlerts.delete(pendingKey(ctx));

      if (!result.ok) {
        await ctx.reply("I could not create that alert. Please try /alert btc above 70000.");
        return;
      }

      await ctx.reply([
        "Alert created.",
        `ID: ${result.alertId}`,
        `${state.coin.symbol.toUpperCase()} ${state.direction} ${formatUsd(targetPrice)}`,
      ].join("\n"));
    } catch (err) {
      log.error("pending_alert.failure", { err: safeErr(err) });
      await ctx.reply("I could not create that alert right now. Please try again in a minute.");
    }
  });

  bot.catch((err) => {
    log.error("bot.catch", { err: safeErr(err.error || err) });
  });

  bot.api.config.use(async (prev, method, payload, signal) => {
    try {
      return await prev(method, payload, signal);
    } catch (err) {
      if (String(method).startsWith("send")) {
        log.error("telegram.send.failure", { method, err: safeErr(err) });
      }
      throw err;
    }
  });

  log.info("bot.created", { platform: "telegram", tokenSet: Boolean(token) });
  return bot;
}

export { mainMenuKeyboard };
