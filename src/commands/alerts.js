import { listUserAlerts } from "../services/alertService.js";
import { formatUsd } from "../utils/format.js";
import { alertsKeyboard } from "../utils/keyboards.js";
import { log, safeErr } from "../lib/logger.js";

export async function sendAlerts(ctx) {
  try {
    const alerts = await listUserAlerts({ telegramUserId: String(ctx.from.id) });

    if (alerts.length === 0) {
      await ctx.reply("You have no active alerts. Create one with /alert btc above 70000.");
      return;
    }

    const lines = ["Your active alerts"];
    for (const alert of alerts) {
      lines.push([
        `ID: ${String(alert._id)}`,
        `${String(alert.symbol).toUpperCase()} ${alert.direction} ${formatUsd(alert.targetPrice)}`,
        `Status: ${alert.status}`,
      ].join("\n"));
    }

    await ctx.reply(lines.join("\n\n"), {
      reply_markup: alertsKeyboard(alerts),
    });
  } catch (err) {
    log.error("command.alerts.failure", { err: safeErr(err) });
    await ctx.reply("I could not load your alerts right now. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("alerts", async (ctx) => {
    await sendAlerts(ctx);
  });
}
