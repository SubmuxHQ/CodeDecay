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

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing required command: $1"
  fi
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
  "pnpm": "$(pnpm --version)",
  "database": "not-required",
  "seedData": "not-required"
}
EOF
}

cd "$ROOT_DIR"

info "checking prerequisites"
check_node_version
require_command pnpm
require_command git
if ! command -v gh >/dev/null 2>&1; then
  warn "gh is optional but recommended for issue and PR workflow"
fi

info "installing dependencies"
pnpm install

info "running local validation"
pnpm run lint
pnpm typecheck
pnpm test
pnpm build

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
