import { listWatchlist } from "../services/watchlistService.js";
import { getPricesByCoinIds } from "../services/priceService.js";
import { formatPercent, formatUsd } from "../utils/format.js";
import { watchlistKeyboard } from "../utils/keyboards.js";
import { log, safeErr } from "../lib/logger.js";

export async function sendWatchlist(ctx) {
  try {
    const items = await listWatchlist({ telegramUserId: String(ctx.from.id) });

    if (items.length === 0) {
      await ctx.reply("Your watchlist is empty. Add one with /addcoin btc.");
      return;
    }

    let prices = new Map();
    try {
      prices = await getPricesByCoinIds(items.map((item) => item.coinId));
    } catch (err) {
      log.warn("watchlist.price_failure", { err: safeErr(err) });
    }

    const lines = ["Your watchlist"];
    for (const item of items) {
      const price = prices.get(item.coinId);
      if (!price) {
        lines.push(`${item.symbol.toUpperCase()} - price unavailable`);
      } else {
        const stale = price.stale ? " cached" : "";
        lines.push(`${item.symbol.toUpperCase()} - ${formatUsd(price.usd)} (${formatPercent(price.usd24hChange)})${stale}`);
      }
    }

    await ctx.reply(lines.join("\n"), {
      reply_markup: watchlistKeyboard(items),
    });
  } catch (err) {
    log.error("command.watchlist.failure", { err: safeErr(err) });
    await ctx.reply("I could not load your watchlist right now. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("watchlist", async (ctx) => {
    await sendWatchlist(ctx);
  });
}
