import { log, safeErr } from "../lib/logger.js";
import { normalizeSymbol } from "../utils/format.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const COIN_LIST_TTL_MS = 12 * 60 * 60 * 1000;
const PRICE_TTL_MS = 45 * 1000;
const STALE_PRICE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

const knownIds = new Map([
  ["btc", { id: "bitcoin", symbol: "btc", name: "Bitcoin" }],
  ["eth", { id: "ethereum", symbol: "eth", name: "Ethereum" }],
  ["sol", { id: "solana", symbol: "sol", name: "Solana" }],
  ["bnb", { id: "binancecoin", symbol: "bnb", name: "BNB" }],
  ["xrp", { id: "ripple", symbol: "xrp", name: "XRP" }],
  ["ada", { id: "cardano", symbol: "ada", name: "Cardano" }],
  ["doge", { id: "dogecoin", symbol: "doge", name: "Dogecoin" }],
  ["matic", { id: "matic-network", symbol: "matic", name: "Polygon" }],
  ["pol", { id: "polygon-ecosystem-token", symbol: "pol", name: "Polygon Ecosystem Token" }],
  ["usdt", { id: "tether", symbol: "usdt", name: "Tether" }],
  ["usdc", { id: "usd-coin", symbol: "usdc", name: "USDC" }],
]);

let coinListCache = {
  data: null,
  expiresAt: 0,
};

const priceCache = new Map();

export class SymbolNotFoundError extends Error {
  constructor(symbol) {
    super(`Unknown symbol: ${symbol}`);
    this.name = "SymbolNotFoundError";
    this.symbol = symbol;
  }
}

export class SymbolAmbiguousError extends Error {
  constructor(symbol, options) {
    super(`Ambiguous symbol: ${symbol}`);
    this.name = "SymbolAmbiguousError";
    this.symbol = symbol;
    this.options = options;
  }
}

function withTimeout(ms = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

async function fetchJson(url, feature) {
  const { signal, clear } = withTimeout();
  const started = Date.now();

  try {
    log.info("price.api.start", { provider: "coingecko", feature });
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });

    if (!res.ok) {
      throw new Error(`CoinGecko HTTP ${res.status}`);
    }

    const json = await res.json();
    log.info("price.api.success", {
      provider: "coingecko",
      feature,
      ms: Date.now() - started,
    });
    return json;
  } catch (err) {
    log.warn("price.api.failure", {
      provider: "coingecko",
      feature,
      err: safeErr(err),
    });
    throw err;
  } finally {
    clear();
  }
}

export async function getCoinList() {
  const now = Date.now();
  if (coinListCache.data && coinListCache.expiresAt > now) return coinListCache.data;

  const json = await fetchJson(`${COINGECKO_BASE}/coins/list?include_platform=false`, "coin_list");
  coinListCache = {
    data: Array.isArray(json) ? json : [],
    expiresAt: now + COIN_LIST_TTL_MS,
  };
  return coinListCache.data;
}

export async function resolveCoin(input) {
  const symbol = normalizeSymbol(input);
  if (!symbol) throw new SymbolNotFoundError(symbol);

  const known = knownIds.get(symbol);
  if (known) return known;

  const list = await getCoinList();
  const matches = list.filter((coin) => String(coin.symbol || "").toLowerCase() === symbol);

  if (matches.length === 0) throw new SymbolNotFoundError(symbol);

  const exactId = matches.find((coin) => String(coin.id || "").toLowerCase() === symbol);
  if (exactId) return exactId;

  if (matches.length === 1) return matches[0];

  const shortOptions = matches.slice(0, 5).map((coin) => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
  }));

  throw new SymbolAmbiguousError(symbol, shortOptions);
}

function freshCachedPrice(coinId) {
  const cached = priceCache.get(coinId);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return { ...cached.value, stale: false };
  return null;
}

function staleCachedPrice(coinId) {
  const cached = priceCache.get(coinId);
  if (!cached) return null;
  if (cached.staleExpiresAt > Date.now()) return { ...cached.value, stale: true };
  return null;
}

function setCachedPrice(coinId, price) {
  priceCache.set(coinId, {
    value: price,
    expiresAt: Date.now() + PRICE_TTL_MS,
    staleExpiresAt: Date.now() + STALE_PRICE_TTL_MS,
  });
}

export async function getPriceByCoinId(coinId) {
  const fresh = freshCachedPrice(coinId);
  if (fresh) return fresh;

  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const json = await fetchJson(url, "simple_price");
    const row = json?.[coinId];
    if (!row || !Number.isFinite(Number(row.usd))) {
      throw new Error("CoinGecko returned no USD price");
    }

    const price = {
      coinId,
      usd: Number(row.usd),
      usd24hChange: Number(row.usd_24h_change),
      fetchedAt: new Date(),
      stale: false,
    };

    setCachedPrice(coinId, price);
    return price;
  } catch (err) {
    const stale = staleCachedPrice(coinId);
    if (stale) return stale;
    throw err;
  }
}

export async function getPricesByCoinIds(coinIds) {
  const uniqueIds = [...new Set(coinIds.filter(Boolean))];
  const output = new Map();
  const missing = [];

  for (const coinId of uniqueIds) {
    const fresh = freshCachedPrice(coinId);
    if (fresh) output.set(coinId, fresh);
    else missing.push(coinId);
  }

  if (missing.length === 0) return output;

  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(missing.join(","))}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const json = await fetchJson(url, "batch_price");

    for (const coinId of missing) {
      const row = json?.[coinId];
      if (!row || !Number.isFinite(Number(row.usd))) continue;

      const price = {
        coinId,
        usd: Number(row.usd),
        usd24hChange: Number(row.usd_24h_change),
        fetchedAt: new Date(),
        stale: false,
      };

      setCachedPrice(coinId, price);
      output.set(coinId, price);
    }
  } catch (err) {
    for (const coinId of missing) {
      const stale = staleCachedPrice(coinId);
      if (stale) output.set(coinId, stale);
    }

    if (output.size === 0) throw err;
  }

  return output;
}

export async function getPriceForSymbol(symbol) {
  const coin = await resolveCoin(symbol);
  const price = await getPriceByCoinId(coin.id);
  return { coin, price };
}
