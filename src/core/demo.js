/**
 * Demo/backtest engine.
 * Uses TradingView replay mode to backtest signal rules on historical data.
 * Steps through bars, evaluates signals, executes trades, and tracks performance.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as chart from "./chart.js";
import * as data from "./data.js";
import * as replay from "./replay.js";
import { loadConfig, evaluateRules } from "./signals.js";

const BACKTESTS_DIR = join(homedir(), ".tradingview-mcp", "backtests");

/**
 * Run a backtest using replay mode.
 * Steps through historical bars, evaluates signal rules at each step,
 * and optionally executes trades based on signals.
 */
export async function runBacktest({
  symbol,
  timeframe,
  start_date,
  rules_path,
  step_count,
  step_delay_ms,
} = {}) {
  if (!symbol) throw new Error("symbol is required");
  if (!start_date) throw new Error("start_date is required (YYYY-MM-DD)");

  const { config } = loadConfig(rules_path);
  const { signal_rules, demo = {} } = config;
  const tf = timeframe || config.default_timeframe || "240";
  const steps = step_count || demo.default_step_count || 100;
  const delay = step_delay_ms || demo.step_delay_ms || 200;
  const autoTrade = demo.auto_trade !== false;

  if (!signal_rules) {
    throw new Error("signals.json is missing signal_rules configuration.");
  }

  // Set up chart
  await chart.setSymbol({ symbol });
  await new Promise((r) => setTimeout(r, 900));
  await chart.setTimeframe({ timeframe: tf });
  await new Promise((r) => setTimeout(r, 900));

  // Start replay
  await replay.start({ date: start_date });
  await new Promise((r) => setTimeout(r, 500));

  const signalLog = [];
  const trades = [];
  let position = null; // "long", "short", or null
  let prevStudies = null;

  for (let i = 0; i < steps; i++) {
    try {
      await replay.step();
      await new Promise((r) => setTimeout(r, delay));

      const [indicators, quote, replayStatus] = await Promise.all([
        data.getStudyValues(),
        data.getQuote({}),
        replay.status(),
      ]);

      const evaluation = evaluateRules(indicators, quote, signal_rules);

      signalLog.push({
        bar: i + 1,
        date: replayStatus.current_date,
        price: quote?.close || quote?.last || quote?.lp || null,
        signal: evaluation.signal,
        buy_score: evaluation.buy_score,
        sell_score: evaluation.sell_score,
        reasons: evaluation.reasons,
      });

      // Execute trades based on signals
      if (autoTrade) {
        if (evaluation.signal === "buy" && position !== "long") {
          // Close existing short if any
          if (position === "short") {
            const closeResult = await replay.trade({ action: "close" });
            trades.push({
              bar: i + 1,
              action: "close_short",
              price: quote?.close || quote?.last || quote?.lp,
              realized_pnl: closeResult.realized_pnl,
            });
          }
          // Open long
          const buyResult = await replay.trade({ action: "buy" });
          position = "long";
          trades.push({
            bar: i + 1,
            action: "buy",
            price: quote?.close || quote?.last || quote?.lp,
            position: buyResult.position,
          });
        } else if (evaluation.signal === "sell" && position !== "short") {
          // Close existing long if any
          if (position === "long") {
            const closeResult = await replay.trade({ action: "close" });
            trades.push({
              bar: i + 1,
              action: "close_long",
              price: quote?.close || quote?.last || quote?.lp,
              realized_pnl: closeResult.realized_pnl,
            });
          }
          // Open short
          const sellResult = await replay.trade({ action: "sell" });
          position = "short";
          trades.push({
            bar: i + 1,
            action: "sell",
            price: quote?.close || quote?.last || quote?.lp,
            position: sellResult.position,
          });
        }
      }

      prevStudies = indicators;
    } catch (err) {
      signalLog.push({ bar: i + 1, error: err.message });
    }
  }

  // Get final status and stop replay
  let finalStatus;
  try {
    finalStatus = await replay.status();
  } catch (_) {
    finalStatus = {};
  }

  try {
    // Close any open position before stopping
    if (position) {
      const closeResult = await replay.trade({ action: "close" });
      trades.push({
        bar: steps,
        action: `close_${position}`,
        price: finalStatus.position || null,
        realized_pnl: closeResult.realized_pnl,
      });
    }
  } catch (_) {}

  try {
    await replay.stop();
  } catch (_) {}

  // Compute performance
  const totalTrades = trades.filter((t) =>
    ["buy", "sell"].includes(t.action),
  ).length;
  const closedTrades = trades.filter((t) => t.realized_pnl !== undefined);
  const winners = closedTrades.filter((t) => t.realized_pnl > 0).length;
  const losers = closedTrades.filter((t) => t.realized_pnl < 0).length;
  const totalPnl = closedTrades.reduce(
    (sum, t) => sum + (t.realized_pnl || 0),
    0,
  );

  const signalsFired = signalLog.filter(
    (s) => s.signal === "buy" || s.signal === "sell",
  ).length;

  const performance = {
    symbol,
    timeframe: tf,
    period: `${start_date} (${steps} bars)`,
    total_trades: totalTrades,
    winners,
    losers,
    win_rate:
      closedTrades.length > 0
        ? ((winners / closedTrades.length) * 100).toFixed(1) + "%"
        : "N/A",
    total_pnl: finalStatus.realized_pnl || totalPnl,
    signals_fired: signalsFired,
    signals_total: steps,
  };

  // Save backtest results
  const dateStr = new Date().toISOString().split("T")[0];
  saveBacktestResults({
    date: dateStr,
    performance,
    trades,
    signal_log: signalLog,
    symbol,
  });

  return {
    success: true,
    performance,
    trades_executed: trades,
    signals_fired: signalsFired,
  };
}

/**
 * Save backtest results to disk.
 */
function saveBacktestResults({ date, performance, trades, signal_log, symbol }) {
  mkdirSync(BACKTESTS_DIR, { recursive: true });
  const filePath = join(BACKTESTS_DIR, `${date}_${symbol}.json`);
  writeFileSync(
    filePath,
    JSON.stringify(
      { date, saved_at: new Date().toISOString(), performance, trades, signal_log },
      null,
      2,
    ),
  );
}

/**
 * Retrieve saved backtest results.
 */
export function getBacktestResults({ date, symbol } = {}) {
  if (!existsSync(BACKTESTS_DIR)) {
    return {
      success: false,
      error: "No backtest results found",
      backtests_dir: BACKTESTS_DIR,
    };
  }

  const dateStr = date || new Date().toISOString().split("T")[0];

  // If symbol specified, look for exact file
  if (symbol) {
    const filePath = join(BACKTESTS_DIR, `${dateStr}_${symbol}.json`);
    if (existsSync(filePath)) {
      return { success: true, ...JSON.parse(readFileSync(filePath, "utf8")) };
    }
    return {
      success: false,
      error: `No backtest found for ${symbol} on ${dateStr}`,
    };
  }

  // Otherwise return all backtests for the date
  const files = readdirSync(BACKTESTS_DIR).filter((f) =>
    f.startsWith(dateStr),
  );

  if (files.length === 0) {
    return { success: false, error: `No backtests found for ${dateStr}` };
  }

  const results = files.map((f) =>
    JSON.parse(readFileSync(join(BACKTESTS_DIR, f), "utf8")),
  );

  return { success: true, date: dateStr, backtests: results };
}
