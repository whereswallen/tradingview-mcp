/**
 * Signal generation engine.
 * Scans watchlist symbols, evaluates indicator data against configurable rules,
 * and produces structured buy/sell/hold signals.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as chart from "./chart.js";
import * as data from "./data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
const SIGNALS_DIR = join(homedir(), ".tradingview-mcp", "signals");

// Common indicator abbreviation mappings for fuzzy matching
const ABBREVIATIONS = {
  rsi: "relative strength index",
  macd: "macd",
  bb: "bollinger bands",
  ema: "moving average exponential",
  sma: "moving average",
  atr: "average true range",
  adx: "average directional index",
  cci: "commodity channel index",
  stoch: "stochastic",
  obv: "on balance volume",
  vwap: "vwap",
  ichimoku: "ichimoku",
};

export function loadConfig(configPath) {
  const candidates = [
    configPath,
    join(PROJECT_ROOT, "signals.json"),
    join(homedir(), ".tradingview-mcp", "signals.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return { config: JSON.parse(readFileSync(p, "utf8")), path: p };
      } catch (e) {
        throw new Error(`Failed to parse signals.json at ${p}: ${e.message}`);
      }
    }
  }

  throw new Error(
    "No signals.json found. Copy signals.example.json to signals.json and configure your signal rules.\n" +
      "Looked in:\n" +
      candidates
        .filter(Boolean)
        .map((p) => `  - ${p}`)
        .join("\n"),
  );
}

/**
 * Find a study by indicator name using fuzzy matching.
 * Tries: exact match → case-insensitive substring → abbreviation mapping.
 */
function findStudy(studies, indicatorName) {
  if (!studies || !studies.length) return null;
  const lower = indicatorName.toLowerCase();

  // Exact match
  for (const s of studies) {
    if (s.name === indicatorName) return s;
  }

  // Case-insensitive substring
  for (const s of studies) {
    if (s.name && s.name.toLowerCase().includes(lower)) return s;
  }

  // Abbreviation mapping
  const expanded = ABBREVIATIONS[lower];
  if (expanded) {
    for (const s of studies) {
      if (s.name && s.name.toLowerCase().includes(expanded)) return s;
    }
  }

  return null;
}

/**
 * Evaluate a single condition against a field value and quote.
 */
function evaluateCondition(condition, fieldValue, threshold, quotePrice) {
  if (fieldValue === undefined || fieldValue === null || fieldValue === "∅") return false;

  const num = typeof fieldValue === "string" ? parseFloat(fieldValue) : fieldValue;
  if (isNaN(num)) return false;

  switch (condition) {
    case "less_than":
      return num < threshold;
    case "greater_than":
      return num > threshold;
    case "equals":
      return Math.abs(num - threshold) < 0.0001;
    case "between":
      return Array.isArray(threshold) && num >= threshold[0] && num <= threshold[1];
    case "price_above":
      return quotePrice > num;
    case "price_below":
      return quotePrice < num;
    case "crosses_above":
      // Snapshot mode: treat as greater_than threshold
      return num > threshold;
    case "crosses_below":
      // Snapshot mode: treat as less_than threshold
      return num < threshold;
    default:
      return false;
  }
}

/**
 * Pure function: evaluate signal rules against indicator data and quote.
 * @param {Array} studies - Array of { name, values: { field: value } } from getStudyValues()
 * @param {object} quote - Quote object with at least { close } or { last }
 * @param {object} rules - Signal rules with buy[], sell[], min_score, min_rules_matched
 * @returns {{ signal: string, buy_score: number, sell_score: number, matched_rules: object[], reasons: string[] }}
 */
export function evaluateRules(studies, quote, rules) {
  const quotePrice = quote?.close || quote?.last || quote?.lp || 0;
  const buyRules = rules.buy || [];
  const sellRules = rules.sell || [];
  const minScore = rules.min_score || 60;
  const minRulesMatched = rules.min_rules_matched || 1;

  const studyList = studies?.studies || studies || [];

  function evalSide(sideRules) {
    let score = 0;
    let matched = 0;
    const matchedRules = [];
    const reasons = [];

    for (const rule of sideRules) {
      const study = findStudy(studyList, rule.indicator);
      if (!study || !study.values) continue;

      const fieldValue = study.values[rule.field];
      if (evaluateCondition(rule.condition, fieldValue, rule.value, quotePrice)) {
        score += rule.weight || 0;
        matched++;
        matchedRules.push({ ...rule, actual_value: fieldValue });
        reasons.push(rule.label || `${rule.indicator} ${rule.field} ${rule.condition} ${rule.value}`);
      }
    }

    return { score, matched, matchedRules, reasons };
  }

  const buy = evalSide(buyRules);
  const sell = evalSide(sellRules);

  let signal = "hold";
  if (buy.score >= minScore && buy.matched >= minRulesMatched) {
    signal = sell.score > buy.score ? "sell" : "buy";
  } else if (sell.score >= minScore && sell.matched >= minRulesMatched) {
    signal = "sell";
  }

  return {
    signal,
    buy_score: buy.score,
    sell_score: sell.score,
    matched_rules: signal === "buy" ? buy.matchedRules : signal === "sell" ? sell.matchedRules : [],
    reasons: signal === "buy" ? buy.reasons : signal === "sell" ? sell.reasons : ["No strong signal detected"],
  };
}

/**
 * Scan all watchlist symbols against signal rules.
 */
export async function scanSignals({ rules_path } = {}) {
  const { config, path: loadedFrom } = loadConfig(rules_path);
  const { watchlist = [], default_timeframe = "240", signal_rules } = config;

  if (!watchlist.length) {
    throw new Error("signals.json watchlist is empty. Add at least one symbol.");
  }
  if (!signal_rules) {
    throw new Error("signals.json is missing signal_rules configuration.");
  }

  // Save current chart state to restore later
  let originalSymbol, originalTimeframe;
  try {
    const currentState = await chart.getState();
    originalSymbol = currentState.symbol;
    originalTimeframe = currentState.resolution;
  } catch (_) {}

  const signals = [];

  for (const symbol of watchlist) {
    try {
      await chart.setSymbol({ symbol });
      await new Promise((r) => setTimeout(r, 900));
      await chart.setTimeframe({ timeframe: default_timeframe });
      await new Promise((r) => setTimeout(r, 900));

      const [indicators, quote] = await Promise.all([
        data.getStudyValues(),
        data.getQuote({}),
      ]);

      const evaluation = evaluateRules(indicators, quote, signal_rules);

      signals.push({
        symbol,
        timeframe: default_timeframe,
        price: quote?.close || quote?.last || quote?.lp || null,
        ...evaluation,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      signals.push({ symbol, error: err.message });
    }
  }

  // Restore original chart state
  if (originalSymbol) {
    try {
      await chart.setSymbol({ symbol: originalSymbol });
      if (originalTimeframe)
        await chart.setTimeframe({ timeframe: originalTimeframe });
    } catch (_) {}
  }

  // Auto-save signals
  const dateStr = new Date().toISOString().split("T")[0];
  saveSignals({ signals, date: dateStr });

  // Summary
  const buys = signals.filter((s) => s.signal === "buy").length;
  const sells = signals.filter((s) => s.signal === "sell").length;
  const holds = signals.filter((s) => s.signal === "hold").length;
  const errors = signals.filter((s) => s.error).length;

  return {
    success: true,
    generated_at: new Date().toISOString(),
    config_loaded_from: loadedFrom,
    summary: { total: signals.length, buy: buys, sell: sells, hold: holds, errors },
    signals,
  };
}

/**
 * Save signals to disk.
 */
export function saveSignals({ signals, date } = {}) {
  mkdirSync(SIGNALS_DIR, { recursive: true });

  const dateStr = date || new Date().toISOString().split("T")[0];
  const filePath = join(SIGNALS_DIR, `${dateStr}.json`);

  const existing = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf8"))
    : {};

  const record = {
    ...existing,
    date: dateStr,
    saved_at: new Date().toISOString(),
    signals,
  };

  writeFileSync(filePath, JSON.stringify(record, null, 2));
  return { success: true, path: filePath, date: dateStr };
}

/**
 * Retrieve saved signals for a date.
 */
export function getSignals({ date } = {}) {
  const dateStr = date || new Date().toISOString().split("T")[0];
  const filePath = join(SIGNALS_DIR, `${dateStr}.json`);

  if (existsSync(filePath)) {
    return { success: true, ...JSON.parse(readFileSync(filePath, "utf8")) };
  }

  // Fall back to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const yesterdayPath = join(SIGNALS_DIR, `${yesterdayStr}.json`);

  if (existsSync(yesterdayPath)) {
    return {
      success: true,
      note: "No signals for today — returning yesterday",
      ...JSON.parse(readFileSync(yesterdayPath, "utf8")),
    };
  }

  return {
    success: false,
    error: `No signals found for ${dateStr} or ${yesterdayStr}`,
    signals_dir: SIGNALS_DIR,
  };
}

/**
 * Get signal history for a symbol over recent days.
 */
export function getSignalHistory({ symbol, days = 7 } = {}) {
  if (!symbol) throw new Error("symbol is required");

  if (!existsSync(SIGNALS_DIR)) {
    return { success: true, symbol, history: [], message: "No signal history found" };
  }

  const files = readdirSync(SIGNALS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, days);

  const history = [];
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(SIGNALS_DIR, file), "utf8"));
      const match = (data.signals || []).find(
        (s) => s.symbol && s.symbol.toLowerCase() === symbol.toLowerCase(),
      );
      if (match) {
        history.push({
          date: data.date || file.replace(".json", ""),
          ...match,
        });
      }
    } catch (_) {}
  }

  return { success: true, symbol, days, history };
}
