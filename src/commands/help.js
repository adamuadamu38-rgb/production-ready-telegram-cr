export const HELP_TEXT = [
  "Crypto Price Alerts Bot commands",
  "",
  "/start - Open the main menu.",
  "Example: /start",
  "",
  "/help - Show command examples.",
  "Example: /help",
  "",
  "/price <symbol> - Show USD price and 24h change.",
  "Example: /price btc",
  "",
  "/watchlist - Show your saved coins.",
  "Example: /watchlist",
  "",
  "/addcoin <symbol> - Add a coin to your watchlist.",
  "Example: /addcoin sol",
  "",
  "/removecoin <symbol> - Remove a coin from your watchlist.",
  "Example: /removecoin sol",
  "",
  "/alert <symbol> above <price> - Alert when price reaches or exceeds a target.",
  "Example: /alert btc above 70000",
  "",
  "/alert <symbol> below <price> - Alert when price reaches or falls below a target.",
  "Example: /alert eth below 2500",
  "",
  "/alerts - List active alerts.",
  "Example: /alerts",
  "",
  "/removealert <alertId> - Remove an active alert.",
  "Example: /removealert 665f1234567890abcdef1234",
].join("\n");

export default function register(bot) {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT);
  });
}
