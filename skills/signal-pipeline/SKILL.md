---
name: signal-pipeline
description: Generate trading signals from indicator data, backtest them in replay mode, and push results to Telegram. Use for automated signal scanning and notification workflows.
---

# Signal Pipeline Workflow

You are running the full signal generation, testing, and notification pipeline.

## Step 1: Configure Signal Rules

Check if signals.json exists:
1. If not, guide the user to copy `signals.example.json` to `signals.json`
2. Review the current rules with the user: watchlist, signal_rules, thresholds
3. Ensure required indicators are on the chart (check via `chart_get_state`)
4. Indicators referenced in signal_rules must be visible on the chart for data extraction

## Step 2: Scan for Signals

1. `signal_scan` — scans all watchlist symbols against configured rules
2. Review the output: each symbol shows signal (buy/sell/hold), score, and matched rules
3. Highlight any actionable signals (buy or sell) with their reasons
4. `signal_get` — retrieve saved signals if already scanned today

## Step 3: Backtest Signals (Optional)

For each symbol with a buy or sell signal:
1. `demo_backtest` with the symbol, a recent start_date (e.g., 30-60 days ago), and the same rules
2. Review performance: win rate, total P&L, signal accuracy
3. Compare backtest results across symbols to validate signal quality
4. `demo_results` — retrieve past backtest results for comparison

## Step 4: Send to Telegram

1. `telegram_status` — verify bot connectivity first
2. `telegram_send_signals` — push today's signals to the configured channel
3. Confirm delivery with the returned message_id
4. For individual alerts: `telegram_send` with custom formatted messages

## Step 5: Review and Iterate

1. `signal_history` — check how signals have changed over recent days for key symbols
2. `demo_results` — review past backtest performance
3. Suggest rule adjustments based on backtest findings (e.g., adjust RSI thresholds, change weights)
4. Re-run the pipeline with updated rules

## Quick Pipeline (All-in-One)

For a fast daily routine:
1. `signal_scan` — generate today's signals
2. `telegram_send_signals` — push to Telegram
3. Done. Backtest periodically to validate rule quality.

## Signal Rule Conditions Reference

| Condition | Description | Example |
|-----------|-------------|---------|
| `less_than` | Field value < threshold | RSI < 30 (oversold) |
| `greater_than` | Field value > threshold | RSI > 70 (overbought) |
| `price_above` | Quote price > indicator value | Price above EMA |
| `price_below` | Quote price < indicator value | Price below EMA |
| `between` | Field value between [low, high] | RSI between [40, 60] |
| `crosses_above` | Snapshot: treated as > threshold | MACD histogram > 0 |
| `crosses_below` | Snapshot: treated as < threshold | MACD histogram < 0 |
