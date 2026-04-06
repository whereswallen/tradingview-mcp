#!/usr/bin/env bash
#
# setup-scheduler.sh — Install/uninstall scheduled signal scanning.
# Supports macOS (launchd) and Linux (cron).
#
# Usage:
#   bash scripts/setup-scheduler.sh          # Install with defaults (every 4 hours)
#   bash scripts/setup-scheduler.sh --hours 2  # Every 2 hours
#   bash scripts/setup-scheduler.sh --uninstall # Remove scheduled task
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CRON_SCRIPT="$SCRIPT_DIR/signal-cron.sh"
PLIST_LABEL="com.tradingview-mcp.signal-cron"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

# Defaults
INTERVAL_HOURS=4
ACTION="install"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hours) INTERVAL_HOURS="$2"; shift 2 ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --help|-h) echo "Usage: $0 [--hours N] [--uninstall]"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

INTERVAL_SECONDS=$((INTERVAL_HOURS * 3600))

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux) echo "linux" ;;
    *) echo "unknown" ;;
  esac
}

install_macos() {
  echo "Setting up launchd plist (every ${INTERVAL_HOURS}h)..."

  mkdir -p "$(dirname "$PLIST_PATH")"
  cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$CRON_SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>$INTERVAL_SECONDS</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/.tradingview-mcp/logs/launchd-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/.tradingview-mcp/logs/launchd-stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"

  echo ""
  echo "Installed! Signal scan will run every ${INTERVAL_HOURS} hours."
  echo "  Plist: $PLIST_PATH"
  echo "  Logs:  ~/.tradingview-mcp/logs/"
  echo ""
  echo "To uninstall: bash $0 --uninstall"
  echo "To test now:  bash $CRON_SCRIPT"
}

uninstall_macos() {
  if [[ -f "$PLIST_PATH" ]]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "Uninstalled launchd plist."
  else
    echo "No launchd plist found at $PLIST_PATH"
  fi
}

install_linux() {
  echo "Setting up cron job (every ${INTERVAL_HOURS}h)..."

  # Build cron expression: run at minute 0 every N hours
  CRON_EXPR="0 */${INTERVAL_HOURS} * * *"

  # Remove existing entry if present, then add new one
  CRON_LINE="$CRON_EXPR /bin/bash $CRON_SCRIPT # tradingview-mcp-signals"
  (crontab -l 2>/dev/null | grep -v "tradingview-mcp-signals" || true; echo "$CRON_LINE") | crontab -

  echo ""
  echo "Installed! Signal scan will run every ${INTERVAL_HOURS} hours."
  echo "  Cron: $CRON_EXPR"
  echo "  Script: $CRON_SCRIPT"
  echo "  Logs: ~/.tradingview-mcp/logs/"
  echo ""
  echo "To verify: crontab -l"
  echo "To uninstall: bash $0 --uninstall"
  echo "To test now:  bash $CRON_SCRIPT"
}

uninstall_linux() {
  (crontab -l 2>/dev/null | grep -v "tradingview-mcp-signals") | crontab - 2>/dev/null || true
  echo "Removed cron job."
}

# Main
OS=$(detect_os)
echo "Detected OS: $OS"

if [[ "$ACTION" == "uninstall" ]]; then
  case "$OS" in
    macos) uninstall_macos ;;
    linux) uninstall_linux ;;
    *) echo "Unsupported OS"; exit 1 ;;
  esac
else
  # Verify prerequisites
  if [[ ! -f "$CRON_SCRIPT" ]]; then
    echo "ERROR: signal-cron.sh not found at $CRON_SCRIPT"
    exit 1
  fi
  chmod +x "$CRON_SCRIPT"

  case "$OS" in
    macos) install_macos ;;
    linux) install_linux ;;
    *) echo "Unsupported OS. Manually add to your scheduler:"; echo "  /bin/bash $CRON_SCRIPT"; exit 1 ;;
  esac
fi
