import { mainMenuKeyboard } from "../utils/keyboards.js";

export const START_TEXT = [
  "Welcome to Crypto Price Alerts Bot.",
  "",
  "I can look up CoinGecko USD prices, keep your watchlist, and notify you when a coin crosses your target price.",
  "",
  "Try /price btc or use the buttons below.",
].join("\n");

export default function register(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(START_TEXT, {
      reply_markup: mainMenuKeyboard(),
    });
  });
}
