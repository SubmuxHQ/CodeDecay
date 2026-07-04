#!/usr/bin/env bash
# Print the local CodeDecay contributor setup status.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$SCRIPT_DIR/local/state.json"

cd "$ROOT_DIR"

probe_package_manager_version() {
  local timeout_seconds="$1"
  shift
  local output_file
  local pid
  local watcher
  local status

  output_file="$(mktemp "${TMPDIR:-/tmp}/codedecay-pm-version.XXXXXX")"
  "$@" >"$output_file" 2>/dev/null &
  pid="$!"
  (
    sleep "$timeout_seconds"
    kill "$pid" 2>/dev/null || true
  ) &
  watcher="$!"

  if wait "$pid"; then
    status=0
  else
    status=$?
  fi

  kill "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true

  if [ "$status" -eq 0 ]; then
    head -n 1 "$output_file"
    rm -f "$output_file"
    return 0
  fi

  rm -f "$output_file"
  return 1
}

pnpm_status() {
  local version

  if command -v pnpm >/dev/null 2>&1; then
    if version="$(probe_package_manager_version 2 pnpm --version)"; then
      printf '%s\n' "$version"
    else
      echo "unavailable (pnpm --version failed or timed out)"
    fi
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    if version="$(probe_package_manager_version 2 corepack pnpm --version)"; then
      printf 'corepack pnpm %s\n' "$version"
    else
      echo "missing (corepack pnpm probe failed or timed out)"
    fi
    return
  fi

  echo missing
}

echo "CodeDecay local status"
echo "repo: $(pwd)"
echo "branch: $(git branch --show-current 2>/dev/null || true)"
echo "node: $(node --version 2>/dev/null || echo missing)"
echo "pnpm: $(pnpm_status)"
echo "git: $(git --version 2>/dev/null || echo missing)"

if [ -f "$STATE_FILE" ]; then
  echo "setup state: $STATE_FILE"
  cat "$STATE_FILE"
else
  echo "setup state: not initialized"
  echo "run: ./.codedecay/setup.local.sh"
fi
