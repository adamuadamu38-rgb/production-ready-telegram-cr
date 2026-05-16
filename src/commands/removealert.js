import { removeAlert } from "../services/alertService.js";
import { log, safeErr } from "../lib/logger.js";

export async function removeAlertForUser(ctx, alertId) {
  try {
    const result = await removeAlert({
      telegramUserId: String(ctx.from.id),
      alertId,
    });

    if (!result.ok) {
      await ctx.reply("That alert was not found, already removed, or belongs to another user.");
      return;
    }

    await ctx.reply("Alert removed.");
  } catch (err) {
    log.error("command.removealert.failure", { err: safeErr(err) });
    await ctx.reply("I could not remove that alert right now. Please try again in a minute.");
  }
}

export default function register(bot) {
  bot.command("removealert", async (ctx) => {
    const alertId = String(ctx.match || "").trim().split(/\s+/)[0];
    if (!alertId) {
      await ctx.reply("Usage: /removealert <alertId>\nExample: /removealert 665f1234567890abcdef1234");
      return;
    }

    await removeAlertForUser(ctx, alertId);
  });
}
