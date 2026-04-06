import { register } from "../router.js";
import * as core from "../../core/signals.js";

register("signal", {
  description: "Trading signal generation — scan, retrieve, and track signals",
  subcommands: new Map([
    [
      "scan",
      {
        description: "Scan watchlist symbols against signal rules",
        options: {
          rules: {
            type: "string",
            short: "r",
            description: "Path to signals.json (default: ./signals.json)",
          },
        },
        handler: async ({ rules }) => core.scanSignals({ rules_path: rules }),
      },
    ],
    [
      "get",
      {
        description: "Get saved signals for a date (defaults to today)",
        options: {
          date: {
            type: "string",
            short: "d",
            description: "Date YYYY-MM-DD (default: today)",
          },
        },
        handler: async ({ date }) => core.getSignals({ date }),
      },
    ],
    [
      "history",
      {
        description: "Get signal history for a symbol",
        options: {
          symbol: {
            type: "string",
            short: "s",
            description: "Symbol to get history for",
          },
          days: {
            type: "string",
            short: "d",
            description: "Number of days to look back (default: 7)",
          },
        },
        handler: async ({ symbol, days }) => {
          if (!symbol) throw new Error("--symbol is required");
          return core.getSignalHistory({
            symbol,
            days: days ? parseInt(days, 10) : undefined,
          });
        },
      },
    ],
  ]),
});
