#!/usr/bin/env bash
# Print the local CodeDecay contributor setup status.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$SCRIPT_DIR/local/state.json"

cd "$ROOT_DIR"

echo "CodeDecay local status"
echo "repo: $(pwd)"
echo "branch: $(git branch --show-current 2>/dev/null || true)"
echo "node: $(node --version 2>/dev/null || echo missing)"
echo "pnpm: $(pnpm --version 2>/dev/null || echo missing)"
echo "git: $(git --version 2>/dev/null || echo missing)"

if [ -f "$STATE_FILE" ]; then
  echo "setup state: $STATE_FILE"
  cat "$STATE_FILE"
else
  echo "setup state: not initialized"
  echo "run: ./.codedecay/setup.local.sh"
fi
