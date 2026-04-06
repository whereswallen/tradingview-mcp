/**
 * Telegram bot integration.
 * Send-only mode (no polling) — pushes signals and messages to a configured channel/group.
 */
import { loadConfig } from "./signals.js";

let bot = null;
let chatId = null;

/**
 * Lazily initialize the Telegram bot instance.
 * Only creates the bot when first needed, not at import time.
 */
async function getBot(configPath) {
  if (bot && chatId) return { bot, chatId };

  const { config } = loadConfig(configPath);
  const tgConfig = config.telegram;

  if (!tgConfig) {
    throw new Error(
      'No telegram config found in signals.json. Add a "telegram" section with bot_token and chat_id.',
    );
  }
  if (!tgConfig.bot_token || tgConfig.bot_token === "YOUR_BOT_TOKEN_HERE") {
    throw new Error(
      "Telegram bot_token not configured. Get a token from @BotFather on Telegram and add it to signals.json.",
    );
  }
  if (!tgConfig.chat_id || tgConfig.chat_id === "YOUR_CHAT_ID_HERE") {
    throw new Error(
      "Telegram chat_id not configured. Add your group/channel chat_id to signals.json.",
    );
  }

  // Dynamic import so the app doesn't crash if node-telegram-bot-api isn't installed
  let TelegramBot;
  try {
    const mod = await import("node-telegram-bot-api");
    TelegramBot = mod.default || mod;
  } catch (err) {
    throw new Error(
      'node-telegram-bot-api is not installed. Run: npm install node-telegram-bot-api',
    );
  }

  bot = new TelegramBot(tgConfig.bot_token, { polling: false });
  chatId = tgConfig.chat_id;

  return { bot, chatId };
}

/**
 * Send a custom text message to the configured Telegram channel.
 */
export async function sendMessage({ text, parse_mode, rules_path } = {}) {
  if (!text) throw new Error("text is required");

  const { bot, chatId } = await getBot(rules_path);
  const opts = {};
  if (parse_mode) opts.parse_mode = parse_mode;

  const result = await bot.sendMessage(chatId, text, opts);
  return {
    success: true,
    message_id: result.message_id,
    chat_id: chatId,
  };
}

/**
 * Format signals into a readable Telegram message.
 */
function formatSignalsMessage(signals, date) {
  const lines = [`*Signal Scan — ${date}*`, ""];

  for (const sig of signals) {
    if (sig.error) {
      lines.push(`${sig.symbol} | ERROR | ${sig.error}`);
      continue;
    }

    const emoji =
      sig.signal === "buy" ? "BUY" : sig.signal === "sell" ? "SELL" : "HOLD";
    const score =
      sig.signal === "buy"
        ? sig.buy_score
        : sig.signal === "sell"
          ? sig.sell_score
          : Math.max(sig.buy_score || 0, sig.sell_score || 0);

    const priceStr = sig.price ? ` @ ${sig.price}` : "";
    const reasonStr =
      sig.reasons && sig.reasons.length
        ? sig.reasons.join(", ")
        : "No strong signals";

    lines.push(`*${sig.symbol}*${priceStr} | ${emoji} | Score: ${score}`);
    lines.push(`  ${reasonStr}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Send today's signals to Telegram.
 * If no saved signals exist, runs a scan first.
 */
export async function sendSignals({ date, rules_path } = {}) {
  const { bot, chatId } = await getBot(rules_path);

  // Try to load saved signals
  const { getSignals, scanSignals } = await import("./signals.js");
  const dateStr = date || new Date().toISOString().split("T")[0];

  let signalData = getSignals({ date: dateStr });

  // If no saved signals, run a scan
  if (!signalData.success || !signalData.signals) {
    signalData = await scanSignals({ rules_path });
  }

  const text = formatSignalsMessage(signalData.signals, dateStr);
  const result = await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });

  return {
    success: true,
    message_id: result.message_id,
    chat_id: chatId,
    signals_sent: signalData.signals.length,
  };
}

/**
 * Send a single real-time signal alert.
 */
export async function sendAlert({ symbol, signal, price, reason, rules_path } = {}) {
  if (!symbol || !signal) throw new Error("symbol and signal are required");

  const { bot, chatId } = await getBot(rules_path);

  const tag = signal.toUpperCase();
  const priceStr = price ? ` @ ${price}` : "";
  const reasonStr = reason || "Signal triggered";
  const text = `*${tag}* ${symbol}${priceStr}\n${reasonStr}`;

  const result = await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });

  return {
    success: true,
    message_id: result.message_id,
    chat_id: chatId,
  };
}

/**
 * Test Telegram bot connectivity and return bot/chat info.
 */
export async function getStatus({ rules_path } = {}) {
  const { bot, chatId } = await getBot(rules_path);

  let botInfo;
  try {
    botInfo = await bot.getMe();
  } catch (err) {
    throw new Error(`Telegram bot connection failed: ${err.message}`);
  }

  let chatInfo;
  try {
    chatInfo = await bot.getChat(chatId);
  } catch (err) {
    chatInfo = { error: err.message };
  }

  return {
    success: true,
    bot: {
      id: botInfo.id,
      username: botInfo.username,
      first_name: botInfo.first_name,
    },
    chat: {
      id: chatId,
      title: chatInfo.title || chatInfo.first_name || null,
      type: chatInfo.type || null,
    },
  };
}
