import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/signals.js";

export function registerSignalTools(server) {
  server.tool(
    "signal_scan",
    "Scan your watchlist symbols against configurable signal rules. Evaluates indicator readings (RSI, MACD, EMA, etc.) and returns structured buy/sell/hold signals with strength scores and matched rule details.",
    {
      rules_path: z
        .string()
        .optional()
        .describe("Optional path to signals.json config file."),
    },
    async ({ rules_path } = {}) => {
      try {
        return jsonResult(await core.scanSignals({ rules_path }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "signal_get",
    "Retrieve saved signals for a date. Returns today's signals if available, otherwise yesterday's.",
    {
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
    },
    async ({ date } = {}) => {
      try {
        return jsonResult(core.getSignals({ date }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "signal_history",
    "Get signal history for a specific symbol over recent days. Useful for tracking how signals have changed.",
    {
      symbol: z.string().describe("Symbol to get history for (e.g., BTCUSD)"),
      days: z.coerce
        .number()
        .optional()
        .describe("Number of days to look back (default 7)"),
    },
    async ({ symbol, days } = {}) => {
      try {
        return jsonResult(core.getSignalHistory({ symbol, days }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
