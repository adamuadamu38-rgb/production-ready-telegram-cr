import { InlineKeyboard } from "grammy";

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("Price lookup", "menu:price")
    .text("Watchlist", "menu:watchlist")
    .row()
    .text("Add alert", "menu:alert")
    .text("Help", "menu:help");
}

export function priceKeyboard(symbol) {
  return new InlineKeyboard()
    .text("Refresh price", `price:refresh:${symbol}`)
    .text("Add alert", `alert:start:${symbol}`)
    .row()
    .text("Watchlist", "menu:watchlist")
    .text("Help", "menu:help");
}

export function watchlistKeyboard(items) {
  const kb = new InlineKeyboard();

  for (const item of items.slice(0, 20)) {
    kb.text(`Remove ${item.symbol.toUpperCase()}`, `wl:remove:${item.coinId}`).text("Add alert", `alert:start:${item.symbol}`).row();
  }

  kb.text("Add coin help", "menu:addcoin").text("Help", "menu:help");
  return kb;
}

export function alertDirectionKeyboard(symbol) {
  return new InlineKeyboard()
    .text("Above", `alert:dir:${symbol}:above`)
    .text("Below", `alert:dir:${symbol}:below`)
    .row()
    .text("Cancel", "alert:cancel");
}

export function alertsKeyboard(alerts) {
  const kb = new InlineKeyboard();

  for (const alert of alerts.slice(0, 20)) {
    kb.text(`Remove ${String(alert._id).slice(-6)}`, `alert:remove:${alert._id}`).row();
  }

  kb.text("Add alert help", "menu:alert").text("Help", "menu:help");
  return kb;
}
