#!/usr/bin/env bash
# Local contributor setup for CodeDecay.
# This is intentionally lighter than app/database projects: CodeDecay does not
# need a local database, seed data, cloud account, API key, or model key to run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_DIR="$SCRIPT_DIR/local"

info() {
  printf '[codedecay] %s\n' "$1"
}

fail() {
  printf '[codedecay] error: %s\n' "$1" >&2
  exit 1
}

warn() {
  printf '[codedecay] warning: %s\n' "$1" >&2
}

PNPM_CMD=()
PNPM_VERSION=""
PNPM_SOURCE=""

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing required command: $1"
  fi
}

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

resolve_pnpm_command() {
  local version

  if command -v pnpm >/dev/null 2>&1; then
    if version="$(probe_package_manager_version 2 pnpm --version)"; then
      PNPM_CMD=(pnpm)
      PNPM_VERSION="$version"
      PNPM_SOURCE="pnpm"
      return
    fi
    warn "pnpm was found, but 'pnpm --version' failed or timed out"
  fi

  if command -v corepack >/dev/null 2>&1; then
    if version="$(probe_package_manager_version 2 corepack pnpm --version)"; then
      PNPM_CMD=(corepack pnpm)
      PNPM_VERSION="$version"
      PNPM_SOURCE="corepack pnpm"
      return
    fi
    warn "corepack was found, but 'corepack pnpm --version' failed or timed out"
  fi

  if command -v npx >/dev/null 2>&1; then
    if version="$(probe_package_manager_version 20 npx --yes pnpm@11.8.0 --version)"; then
      PNPM_CMD=(npx --yes pnpm@11.8.0)
      PNPM_VERSION="$version"
      PNPM_SOURCE="npx pnpm@11.8.0"
      return
    fi
    warn "npx was found, but 'npx --yes pnpm@11.8.0 --version' failed or timed out"
  fi

  fail "missing usable package manager: pnpm. Install pnpm, repair Corepack, or make npx available for pnpm@11.8.0."
}

run_pnpm() {
  "${PNPM_CMD[@]}" "$@"
}

check_node_version() {
  require_command node
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "$major" -lt 20 ]; then
    fail "Node.js 20 or newer is required; found $(node --version)"
  fi
}

write_state() {
  mkdir -p "$LOCAL_DIR"
  cat > "$LOCAL_DIR/state.json" <<EOF
{
  "version": 1,
  "setupAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "repo": "SubmuxHQ/CodeDecay",
  "branch": "$(git branch --show-current 2>/dev/null || true)",
  "node": "$(node --version)",
  "pnpm": "$PNPM_VERSION",
  "packageManagerSource": "$PNPM_SOURCE",
  "database": "not-required",
  "seedData": "not-required"
}
EOF
}

cd "$ROOT_DIR"

info "checking prerequisites"
check_node_version
require_command git
resolve_pnpm_command
info "using package manager: ${PNPM_SOURCE} (${PNPM_VERSION})"
if ! command -v gh >/dev/null 2>&1; then
  warn "gh is optional but recommended for issue and PR workflow"
fi

info "installing dependencies"
run_pnpm install

info "running local validation"
run_pnpm run lint
run_pnpm typecheck
run_pnpm test
run_pnpm build

info "writing local setup state"
write_state

cat <<'EOF'

CodeDecay local setup complete.

No local database or seed data is required for this repo.

Useful next commands:
  pnpm test
  pnpm build
  node packages/cli/dist/index.js analyze --format markdown
  node packages/cli/dist/index.js config --format markdown

Agent setup:
  - Read AGENTS.md first.
  - Use .agents/commands/redteam-pr.md to review PRs with analyze, redteam, and agent bundle evidence.
  - Use .agents/skills/pr-red-team/SKILL.md for PR safety reviews.
  - Use .agents/commands/ci-check.md before opening a PR.
  - Give codedecay-agent.md to your own Codex, Claude Code, Cursor, desktop agent, or MCP client when fixes are needed.
  - CodeDecay setup and agent bundles do not require telemetry, API keys, LLM calls, model calls, or CodeDecayCloud.
EOF
