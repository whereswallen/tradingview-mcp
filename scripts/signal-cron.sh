#!/usr/bin/env bash
#
# signal-cron.sh — Automated signal scan + Telegram push.
# Designed to be run by cron, launchd, or manually.
#
# Usage:
#   bash scripts/signal-cron.sh
#   bash scripts/signal-cron.sh --rules /path/to/signals.json
#
# Requires:
#   - TradingView Desktop running with --remote-debugging-port=9222
#   - signals.json configured with watchlist, rules, and telegram settings
#   - node-telegram-bot-api installed (npm install)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TV_CLI="node $PROJECT_DIR/src/cli/index.js"
LOG_DIR="$HOME/.tradingview-mcp/logs"
LOG_FILE="$LOG_DIR/signal-cron-$(date +%Y-%m-%d).log"

# Parse optional --rules flag
RULES_FLAG=""
if [[ "${1:-}" == "--rules" && -n "${2:-}" ]]; then
  RULES_FLAG="--rules $2"
fi

# Ensure log directory exists
mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Signal cron started ==="

# Check if TradingView is reachable via CDP
if ! curl -s --max-time 3 "http://${CDP_HOST:-localhost}:${CDP_PORT:-9222}/json/version" > /dev/null 2>&1; then
  log "TradingView not running (CDP not reachable). Skipping."
  exit 0
fi

log "TradingView is running. Starting signal scan..."

# Run signal scan
SCAN_OUTPUT=$($TV_CLI signal scan $RULES_FLAG 2>&1) || true
echo "$SCAN_OUTPUT" >> "$LOG_FILE"

# Check if scan succeeded
if echo "$SCAN_OUTPUT" | grep -q '"success": true'; then
  log "Signal scan completed successfully."

  # Count actionable signals
  BUY_COUNT=$(echo "$SCAN_OUTPUT" | grep -c '"signal": "buy"' || true)
  SELL_COUNT=$(echo "$SCAN_OUTPUT" | grep -c '"signal": "sell"' || true)
  log "Results: $BUY_COUNT buy, $SELL_COUNT sell signals."

  # Push to Telegram
  log "Sending signals to Telegram..."
  TG_OUTPUT=$($TV_CLI telegram signals $RULES_FLAG 2>&1) || true
  echo "$TG_OUTPUT" >> "$LOG_FILE"

  if echo "$TG_OUTPUT" | grep -q '"success": true'; then
    log "Telegram send successful."
  else
    log "WARNING: Telegram send failed."
  fi
else
  log "WARNING: Signal scan failed. Check signals.json config."
fi

# Clean up old logs (keep 30 days)
find "$LOG_DIR" -name "signal-cron-*.log" -mtime +30 -delete 2>/dev/null || true

log "=== Signal cron finished ==="
