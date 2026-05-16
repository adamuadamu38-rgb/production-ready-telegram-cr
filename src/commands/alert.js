import { resolveCoin, SymbolAmbiguousError, SymbolNotFoundError } from "../services/priceService.js";
import { createAlert } from "../services/alertService.js";
import { formatUsd, usageAlert } from "../utils/format.js";
import { log, safeErr } from "../lib/logger.js";

export async function createAlertForUser(ctx, { symbol, direction, targetPrice }) {
  try {
    const coin = await resolveCoin(symbol);
    const result = await createAlert({
      telegramUserId: String(ctx.from.id),
      chatId: String(ctx.chat.id),
      coin,
      direction,
      targetPrice,
    });

    if (!result.ok) {
      if (result.reason === "limit") {
        await ctx.reply("You have reached the active alert limit. Remove an alert before adding another one.");
        return;
      }

      await ctx.reply(usageAlert());
      return;
    }

    await ctx.reply([
      "Alert created.",
      `ID: ${result.alertId}`,
      `${coin.symbol.toUpperCase()} ${direction} ${formatUsd(targetPrice)}`,
    ].join("\n"));
  } catch (err) {
    if (err instanceof SymbolAmbiguousError) {
      await ctx.reply([
        `The symbol ${err.symbol.toUpperCase()} matches multiple coins.`,
        ...err.options.map((coin) => `${coin.name} (${coin.symbol.toUpperCase()}) id: ${coin.id}`),
      ].join("\n"));
      return;
    }

    if (err instanceof SymbolNotFoundError) {
      await ctx.reply(`I could not find that coin.\n${usageAlert()}`);
      return;
    }

    log.error("command.alert.failure", { err: safeErr(err) });
    await ctx.reply("I could not create that alert right now. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("alert", async (ctx) => {
    const parts = String(ctx.match || "").trim().split(/\s+/).filter(Boolean);
    const [symbol, direction, rawPrice] = parts;
    const targetPrice = Number(rawPrice);

    if (!symbol || !["above", "below"].includes(String(direction || "").toLowerCase()) || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      await ctx.reply(usageAlert());
      return;
    }

    await createAlertForUser(ctx, {
      symbol,
      direction: direction.toLowerCase(),
      targetPrice,
    });
  });
}
