import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/telegram.js";

export function registerTelegramTools(server) {
  server.tool(
    "telegram_send",
    "Send a custom text message to the configured Telegram channel/group.",
    {
      text: z.string().describe("Message text to send"),
      parse_mode: z
        .string()
        .optional()
        .describe("Parse mode: Markdown or HTML (default: none)"),
    },
    async ({ text, parse_mode } = {}) => {
      try {
        return jsonResult(await core.sendMessage({ text, parse_mode }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "telegram_send_signals",
    "Send today's trading signals to Telegram. Runs a signal scan first if no saved signals exist for the date.",
    {
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
      rules_path: z
        .string()
        .optional()
        .describe("Optional path to signals.json config file."),
    },
    async ({ date, rules_path } = {}) => {
      try {
        return jsonResult(await core.sendSignals({ date, rules_path }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "telegram_status",
    "Test Telegram bot connectivity. Returns bot info and chat details.",
    {},
    async () => {
      try {
        return jsonResult(await core.getStatus());
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
