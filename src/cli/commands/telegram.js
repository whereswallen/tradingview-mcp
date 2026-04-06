import { register } from "../router.js";
import * as core from "../../core/telegram.js";

register("telegram", {
  description: "Send messages and signals to Telegram",
  subcommands: new Map([
    [
      "send",
      {
        description: "Send a custom message to the configured Telegram channel",
        options: {
          text: {
            type: "string",
            short: "t",
            description: "Message text to send",
          },
          "parse-mode": {
            type: "string",
            description: "Parse mode: Markdown or HTML",
          },
        },
        handler: async (opts) => {
          const text = opts.text;
          if (!text) throw new Error("--text is required");
          return core.sendMessage({ text, parse_mode: opts["parse-mode"] });
        },
      },
    ],
    [
      "signals",
      {
        description:
          "Send today's signals to Telegram (runs scan if no saved signals)",
        options: {
          date: {
            type: "string",
            short: "d",
            description: "Date YYYY-MM-DD (default: today)",
          },
          rules: {
            type: "string",
            short: "r",
            description: "Path to signals.json",
          },
        },
        handler: async ({ date, rules }) =>
          core.sendSignals({ date, rules_path: rules }),
      },
    ],
    [
      "status",
      {
        description: "Test Telegram bot connectivity",
        handler: async () => core.getStatus(),
      },
    ],
  ]),
});
