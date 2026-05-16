export function normalizeSymbol(value) {
  return String(value || "").trim().replace(/^\$/, "").toLowerCase();
}

export function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "unavailable";

  const maximumFractionDigits = n >= 1 ? 2 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(n);
}

export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "unavailable";
  const sign = n > 0 ? "+" : "";
  const marker = n > 0 ? "up" : n < 0 ? "down" : "flat";
  return `${sign}${n.toFixed(2)}% ${marker}`;
}

export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatPriceMessage({ coin, price, stale = false }) {
  const staleLine = stale ? "\nData note: showing the latest cached price because live data is unavailable." : "";

  return [
    `${coin.symbol.toUpperCase()} price`,
    `${coin.name} (${coin.symbol.toUpperCase()})`,
    `USD price: ${formatUsd(price.usd)}`,
    `24h change: ${formatPercent(price.usd24hChange)}`,
    `Updated: ${formatDateTime(price.fetchedAt)}`,
    staleLine,
  ].filter(Boolean).join("\n");
}

export function usagePrice() {
  return "Usage: /price btc\nExample: /price eth";
}

export function usageAlert() {
  return "Usage: /alert <symbol> above <price>\nExample: /alert btc above 70000\nExample: /alert eth below 2500";
}
