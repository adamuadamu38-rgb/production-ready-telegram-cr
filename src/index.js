import "dotenv/config";
import { run } from "@grammyjs/runner";
import { log, safeErr } from "./lib/logger.js";

let currentRunner = null;
let stopping = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importMaybe(path) {
  try {
    return await import(path);
  } catch (err) {
    log.error("boot.import.failure", { path, code: err?.code, err: safeErr(err) });
    throw err;
  }
}

process.on("unhandledRejection", (err) => {
  log.error("process.unhandledRejection", { err: safeErr(err) });
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  log.error("process.uncaughtException", { err: safeErr(err) });
  process.exit(1);
});

async function startPolling(bot) {
  let backoffMs = 2000;

  while (!stopping) {
    try {
      log.info("telegram.webhook.clear.start");
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      log.info("telegram.polling.start", { concurrency: 1 });

      currentRunner = run(bot, {
        runner: {
          fetch: {
            allowed_updates: ["message", "callback_query"],
          },
        },
      });

      await currentRunner.task();
      if (!stopping) {
        log.warn("telegram.polling.stopped", { retryInMs: backoffMs });
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 20000);
      }
    } catch (err) {
      const message = safeErr(err);
      log.error("telegram.polling.failure", { err: message, retryInMs: backoffMs });

      try {
        currentRunner?.stop?.();
      } catch (stopErr) {
        log.warn("telegram.polling.stop_failure", { err: safeErr(stopErr) });
      }

      if (!stopping) {
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 20000);
      }
    }
  }
}

async function boot() {
  try {
    log.info("boot.start");

    const { cfg } = await importMaybe("./lib/config.js");
    log.info("boot.env", {
      telegramBotTokenSet: Boolean(cfg.TELEGRAM_BOT_TOKEN),
      mongodbUriSet: Boolean(cfg.MONGODB_URI),
    });

    if (!cfg.TELEGRAM_BOT_TOKEN) {
      console.error("TELEGRAM_BOT_TOKEN is required. Add it to your environment and redeploy.");
      process.exit(1);
    }

    if (!cfg.MONGODB_URI) {
      console.error("MONGODB_URI is required. Add it to your environment and redeploy.");
      process.exit(1);
    }

    const { connectMongo, closeMongo } = await importMaybe("./lib/mongo.js");
    const { createBot } = await importMaybe("./bot.js");
    const { registerCommands } = await importMaybe("./commands/loader.js");
    const { startAlertPolling, stopAlertPolling } = await importMaybe("./services/alertService.js");

    await connectMongo(cfg.MONGODB_URI);

    const bot = createBot(cfg.TELEGRAM_BOT_TOKEN);
    await registerCommands(bot);
    await bot.init();

    await bot.api.setMyCommands([
      { command: "start", description: "Open the main menu" },
      { command: "help", description: "Show command examples" },
      { command: "price", description: "Look up a coin price" },
      { command: "watchlist", description: "Show saved coins" },
      { command: "addcoin", description: "Add a coin to watchlist" },
      { command: "removecoin", description: "Remove a coin from watchlist" },
      { command: "alert", description: "Create a price alert" },
      { command: "alerts", description: "List active alerts" },
      { command: "removealert", description: "Remove an alert" },
    ]);

    const shutdown = async (signal) => {
      if (stopping) return;
      stopping = true;
      log.info("shutdown.start", { signal });

      try {
        currentRunner?.stop?.();
        await stopAlertPolling();
        await closeMongo();
      } catch (err) {
        log.error("shutdown.failure", { err: safeErr(err) });
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    startAlertPolling(bot.api);
    await startPolling(bot);
  } catch (err) {
    log.error("boot.failure", { code: err?.code, err: safeErr(err) });
    if (err?.code === "ERR_MODULE_NOT_FOUND") {
      console.error("Check that all ESM imports include .js extensions and referenced files exist.");
    }
    process.exit(1);
  }
}

boot();
