import { getPriceForSymbol, SymbolAmbiguousError, SymbolNotFoundError } from "../services/priceService.js";
import { formatPriceMessage, usagePrice } from "../utils/format.js";
import { priceKeyboard } from "../utils/keyboards.js";
import { log, safeErr } from "../lib/logger.js";

export async function sendPriceReply(ctx, symbol, edit = false) {
  try {
    const { coin, price } = await getPriceForSymbol(symbol);
    const text = formatPriceMessage({ coin, price, stale: price.stale });
    const options = { reply_markup: priceKeyboard(coin.symbol) };

    if (edit && ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, options);
    } else {
      await ctx.reply(text, options);
    }
  } catch (err) {
    if (err instanceof SymbolAmbiguousError) {
      const lines = [
        `The symbol ${err.symbol.toUpperCase()} matches multiple coins.`,
        "Try one of these CoinGecko IDs or a more specific symbol:",
        ...err.options.map((coin) => `${coin.name} (${coin.symbol.toUpperCase()}) id: ${coin.id}`),
      ];
      await ctx.reply(lines.join("\n"));
      return;
    }

    if (err instanceof SymbolNotFoundError) {
      await ctx.reply(`I could not find that coin symbol.\n${usagePrice()}`);
      return;
    }

    log.warn("command.price.failure", { err: safeErr(err) });
    await ctx.reply("Crypto price data is temporarily unavailable. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("price", async (ctx) => {
    const symbol = String(ctx.match || "").trim().split(/\s+/)[0];
    if (!symbol) {
      await ctx.reply(usagePrice());
      return;
    }

    await sendPriceReply(ctx, symbol);
  });
}
