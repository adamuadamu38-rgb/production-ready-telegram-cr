Crypto Price Alerts Bot

1) What it does

This is a Telegram-only crypto price and alerts bot built with Node.js ES modules and grammY.

It uses CoinGecko for market data and MongoDB for durable users, watchlists, and alerts. The bot can look up coin prices by symbol, save watchlists, create above or below alerts, and notify users when targets are reached.

2) Public commands

/start
Opens the main menu and shows quick buttons for price lookup, watchlist, add alert, and help.
Usage: /start

/help
Shows all commands with examples.
Usage: /help

/price <symbol>
Shows the current USD price and 24h percentage change for a coin.
Usage: /price btc
Example: /price eth

/watchlist
Shows your saved coins and current cached or fetched prices where available.
Usage: /watchlist

/addcoin <symbol>
Adds a coin to your watchlist.
Usage: /addcoin btc
Example: /addcoin sol

/removecoin <symbol>
Removes a coin from your watchlist.
Usage: /removecoin btc
Example: /removecoin sol

/alert <symbol> above <price>
Creates an alert that triggers when the coin price is greater than or equal to the target.
Usage: /alert btc above 70000

/alert <symbol> below <price>
Creates an alert that triggers when the coin price is less than or equal to the target.
Usage: /alert eth below 2500

/alerts
Lists your active alerts with IDs, coin, direction, target price, and status.
Usage: /alerts

/removealert <alertId>
Removes one active alert that belongs to you.
Usage: /removealert 665f1234567890abcdef1234

3) Inline buttons

The bot uses Telegram inline keyboards for common actions:

1) Refresh price after /price.
2) Start an alert from a price result.
3) Open watchlist from the main menu.
4) Remove watchlist coins.
5) Remove active alerts.
6) Open help.

If a button references an alert or watchlist item that was already removed, the bot replies with a friendly stale-action message.

4) Environment variables

TELEGRAM_BOT_TOKEN
Required. Telegram bot token from BotFather. The app logs only whether it is set, never the token value.

MONGODB_URI
Required. MongoDB connection string for users, watchlists, alerts, and alert events. The app logs only whether it is set, never the connection string.

5) Market data

Provider: CoinGecko public API.

Used endpoints:

1) GET https://api.coingecko.com/api/v3/coins/list?include_platform=false
Used to resolve symbols such as btc, eth, and sol to CoinGecko coin IDs. Cached for 12 hours in memory.

2) GET https://api.coingecko.com/api/v3/simple/price
Used to fetch USD price and 24h percentage change. Cached briefly in memory to reduce rate pressure.

If CoinGecko is unavailable, rate-limited, or times out, the bot sends: Crypto price data is temporarily unavailable. Please try again in a minute. If stale cached data exists, the bot may show it with a cached-data note.

6) Database collections

users
Stores Telegram user ID, chat ID, username, first name, language code, createdAt, updatedAt, and lastSeenAt.

watchlists
Stores one record per Telegram user and CoinGecko coin ID. Unique index: telegramUserId plus coinId.

alerts
Stores active and historical alerts with Telegram user ID, chat ID, CoinGecko coin ID, symbol, direction, target price, active flag, status, triggeredAt, lastCheckedAt, lastObservedPrice, notification status, createdAt, and updatedAt.

alert_events
Stores alert trigger events for troubleshooting and audit history.

MongoDB write safety is enforced. createdAt is set only on insert. Updates use updatedAt and do not overwrite createdAt.

7) Alert polling

The alert polling loop runs in the same Node.js process as the Telegram bot. It does not create a worker, queue, or second service.

Default behavior:

1) Polls every 60 seconds.
2) Logs when polling starts.
3) Logs each cycle.
4) Groups active alerts by CoinGecko coin ID to reduce API calls.
5) Marks triggered alerts inactive so they do not repeatedly fire.
6) Logs Telegram notification failures safely and keeps running.

8) Setup

Install dependencies:
npm install

Create a .env file using .env.sample:
TELEGRAM_BOT_TOKEN=your_token_here
MONGODB_URI=your_mongodb_uri_here

Run locally:
npm run dev

Run production:
npm start

Build command for Render or similar:
npm run build

9) Deployment notes

Use one Node.js web service or worker service that runs npm start.

Required environment variables:

1) TELEGRAM_BOT_TOKEN
2) MONGODB_URI

The app uses long polling through @grammyjs/runner. Before polling starts, it clears the Telegram webhook with drop_pending_updates. If Telegram reports a getUpdates conflict during deploy overlap, the bot logs the issue, backs off, and retries instead of crashing.

10) Troubleshooting

If the bot exits immediately, check the startup logs. It fails fast when TELEGRAM_BOT_TOKEN or MONGODB_URI is missing.

If commands do not respond, confirm the Telegram token is valid and no other process is polling the same bot token.

If price lookups fail, CoinGecko may be down, slow, or rate-limited. Try again after a minute.

If alerts do not trigger, check that alerts are active with /alerts and confirm the current CoinGecko price has crossed the target.

Logs are production-safe. They show booleans for env sanity and safe error messages, but never token values or database connection strings.
