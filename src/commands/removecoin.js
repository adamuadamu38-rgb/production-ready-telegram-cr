import { resolveCoin, SymbolNotFoundError, SymbolAmbiguousError } from "../services/priceService.js";
import { removeWatchlistCoin } from "../services/watchlistService.js";
import { log, safeErr } from "../lib/logger.js";

export async function removeCoinForUser(ctx, symbol) {
  try {
    const coin = await resolveCoin(symbol);
    const removed = await removeWatchlistCoin({
      telegramUserId: String(ctx.from.id),
      coinId: coin.id,
    });

    if (!removed) {
      await ctx.reply("That coin is not in your watchlist, or the action is already done.");
      return;
    }

    await ctx.reply(`${coin.symbol.toUpperCase()} was removed from your watchlist.`);
  } catch (err) {
    if (err instanceof SymbolNotFoundError) {
      await ctx.reply("I could not find that coin. Example: /removecoin btc");
      return;
    }

    if (err instanceof SymbolAmbiguousError) {
      await ctx.reply("That symbol is ambiguous. Open /watchlist and use the remove button for the exact saved coin.");
      return;
    }

    log.error("command.removecoin.failure", { err: safeErr(err) });
    await ctx.reply("I could not update your watchlist right now. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("removecoin", async (ctx) => {
    const symbol = String(ctx.match || "").trim().split(/\s+/)[0];
    if (!symbol) {
      await ctx.reply("Usage: /removecoin <symbol>\nExample: /removecoin btc");
      return;
    }

    await removeCoinForUser(ctx, symbol);
  });
}
