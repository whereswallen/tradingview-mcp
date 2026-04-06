import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/demo.js";

export function registerDemoTools(server) {
  server.tool(
    "demo_backtest",
    "Backtest signal rules on historical data using replay mode. Steps through bars, evaluates signals at each step, and optionally executes trades. Returns performance metrics including win rate, P&L, and signal accuracy.",
    {
      symbol: z.string().describe("Symbol to backtest (e.g., BTCUSD, ES1!)"),
      start_date: z
        .string()
        .describe("Start date for replay in YYYY-MM-DD format"),
      timeframe: z
        .string()
        .optional()
        .describe("Timeframe (e.g., 1, 5, 15, 60, 240, D). Defaults to config default."),
      step_count: z.coerce
        .number()
        .optional()
        .describe("Number of bars to step through (default: 100)"),
      step_delay_ms: z.coerce
        .number()
        .optional()
        .describe("Delay between steps in ms (default: 200)"),
      rules_path: z
        .string()
        .optional()
        .describe("Optional path to signals.json config file."),
    },
    async ({ symbol, start_date, timeframe, step_count, step_delay_ms, rules_path } = {}) => {
      try {
        return jsonResult(
          await core.runBacktest({
            symbol,
            start_date,
            timeframe,
            step_count,
            step_delay_ms,
            rules_path,
          }),
        );
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "demo_results",
    "Retrieve saved backtest results for a date and optional symbol.",
    {
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
      symbol: z
        .string()
        .optional()
        .describe("Symbol to filter results for."),
    },
    async ({ date, symbol } = {}) => {
      try {
        return jsonResult(core.getBacktestResults({ date, symbol }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
