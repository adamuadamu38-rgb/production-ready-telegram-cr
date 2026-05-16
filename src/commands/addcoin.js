import { resolveCoin, SymbolAmbiguousError, SymbolNotFoundError } from "../services/priceService.js";
import { addWatchlistCoin } from "../services/watchlistService.js";
import { log, safeErr } from "../lib/logger.js";

export async function addCoinForUser(ctx, symbol) {
  try {
    const coin = await resolveCoin(symbol);
    const result = await addWatchlistCoin({
      telegramUserId: String(ctx.from.id),
      coin,
    });

    if (!result.ok && result.reason === "limit") {
      await ctx.reply("Your watchlist is full. Remove a coin before adding another one.");
      return;
    }

    await ctx.reply(`${coin.symbol.toUpperCase()} was added to your watchlist.`);
  } catch (err) {
    if (err instanceof SymbolAmbiguousError) {
      await ctx.reply([
        `The symbol ${err.symbol.toUpperCase()} matches multiple coins.`,
        ...err.options.map((coin) => `${coin.name} (${coin.symbol.toUpperCase()}) id: ${coin.id}`),
      ].join("\n"));
      return;
    }

    if (err instanceof SymbolNotFoundError) {
      await ctx.reply("I could not find that coin. Example: /addcoin btc");
      return;
    }

    log.error("command.addcoin.failure", { err: safeErr(err) });
    await ctx.reply("I could not update your watchlist right now. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("addcoin", async (ctx) => {
    const symbol = String(ctx.match || "").trim().split(/\s+/)[0];
    if (!symbol) {
      await ctx.reply("Usage: /addcoin <symbol>\nExample: /addcoin btc");
      return;
    }

    await addCoinForUser(ctx, symbol);
  });
}
