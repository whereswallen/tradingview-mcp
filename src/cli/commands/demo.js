import { register } from "../router.js";
import * as core from "../../core/demo.js";

register("demo", {
  description: "Backtest signal rules on historical data using replay mode",
  subcommands: new Map([
    [
      "backtest",
      {
        description:
          "Run a backtest — step through historical bars, evaluate signals, execute trades",
        options: {
          symbol: {
            type: "string",
            short: "s",
            description: "Symbol to backtest (e.g., BTCUSD)",
          },
          date: {
            type: "string",
            short: "d",
            description: "Start date YYYY-MM-DD",
          },
          timeframe: {
            type: "string",
            short: "t",
            description: "Timeframe (e.g., 60, 240, D)",
          },
          steps: {
            type: "string",
            short: "n",
            description: "Number of bars to step through (default: 100)",
          },
          delay: {
            type: "string",
            description: "Delay between steps in ms (default: 200)",
          },
          rules: {
            type: "string",
            short: "r",
            description: "Path to signals.json",
          },
        },
        handler: async ({ symbol, date, timeframe, steps, delay, rules }) => {
          if (!symbol) throw new Error("--symbol is required");
          if (!date) throw new Error("--date is required (YYYY-MM-DD)");
          return core.runBacktest({
            symbol,
            start_date: date,
            timeframe,
            step_count: steps ? parseInt(steps, 10) : undefined,
            step_delay_ms: delay ? parseInt(delay, 10) : undefined,
            rules_path: rules,
          });
        },
      },
    ],
    [
      "results",
      {
        description: "Get saved backtest results",
        options: {
          date: {
            type: "string",
            short: "d",
            description: "Date YYYY-MM-DD (default: today)",
          },
          symbol: {
            type: "string",
            short: "s",
            description: "Filter by symbol",
          },
        },
        handler: async ({ date, symbol }) =>
          core.getBacktestResults({ date, symbol }),
      },
    ],
  ]),
});
