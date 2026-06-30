import { AGENT_PROFILE_IDS } from "@submuxhq/codedecay-agent";
import type { CommandDoc } from "../../renderers/discovery";

export const ORCHESTRATION_COMMAND_DOCS: Record<string, CommandDoc> = {
  redteam: {
    name: "redteam",
    summary: "Merge-safety report with impact, weak-test evidence, edge cases, and fix tasks.",
    usage: ["codedecay redteam [options]"],
    description: [
      "Produce a deterministic red-team review bundle that packages likely breakage paths, missing tests, edge cases, config context, and local skill context."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write redteam report to a file instead of stdout" },
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk" },
      { flag: "--investigate", description: "Explicitly run the configured local/BYOK LLM provider for untrusted suggestions" }
    ],
    examples: [
      "codedecay redteam --base main --head HEAD --format markdown",
      "codedecay redteam --investigate --base main --head HEAD --format markdown",
      "codedecay redteam --cwd ../my-repo --format json"
    ],
    notes: [
      "Redteam reports do not execute configured commands or call LLMs by default. Use --investigate to opt into the configured LLM provider.",
      "Configured checks are described in the report as recommendations unless you run execute or differential explicitly."
    ]
  },
  revalidate: {
    name: "revalidate",
    summary: "Re-check prior findings and preview memory updates.",
    usage: ["codedecay revalidate --input <report.json> [options]"],
    description: [
      "Compare a previous CodeDecay JSON report with a fresh deterministic report, mark finding lifecycle status, and preview memory loopback entries."
    ],
    options: [
      { flag: "--input <path>", description: "Previous CodeDecay JSON report to revalidate" },
      { flag: "--base <ref>", description: "Base git ref to compare from for the fresh report" },
      { flag: "--head <ref>", description: "Head git ref to compare to for the fresh report" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write revalidation report to a file instead of stdout" },
      { flag: "--false-positive <id>", description: "Explicitly mark a previous finding id as false-positive; can be repeated" },
      { flag: "--accept-risk <id>", description: "Explicitly mark a previous finding id as accepted-risk; can be repeated" },
      { flag: "--apply-memory", description: "Write previewed memory loopback entries to .codedecay/memory.json" }
    ],
    examples: [
      "codedecay analyze --format json --output .codedecay/previous-report.json",
      "codedecay revalidate --input .codedecay/previous-report.json --format markdown",
      "codedecay revalidate --input .codedecay/previous-report.json --accept-risk finding:risky-auth-change:src/auth/session.ts:4 --apply-memory"
    ],
    notes: [
      "Revalidation is deterministic and does not call models or hosted services.",
      "Memory updates are preview-only unless --apply-memory is provided.",
      "AI verdicts, if added later, must be shown separately as untrusted suggestions."
    ]
  },
  "llm-review": {
    name: "llm-review",
    summary: "Optional LLM-assisted review suggestions grounded in deterministic analysis.",
    usage: ["codedecay llm-review [options]"],
    description: [
      "Load the configured user-owned LLM provider, ground it in CodeDecay's deterministic PR analysis, and request untrusted review suggestions."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write the LLM review output to a file instead of stdout" },
      { flag: "--task <text>", description: "Override the default review task prompt" },
      { flag: "--ping", description: "Validate provider connectivity without sending PR analysis context" }
    ],
    examples: [
      "codedecay llm-review --ping",
      "codedecay llm-review --base main --head HEAD --format markdown",
      "codedecay llm-review --task \"Focus on auth regressions and missing route checks\" --format json"
    ],
    notes: [
      "This command is explicit opt-in. Deterministic analyze, redteam, agent, and snapshot commands do not call models by default.",
      "LLM suggestions are untrusted until verified by tests, configured checks, or manual review."
    ]
  },
  agent: {
    name: "agent",
    summary: "Task bundle for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients.",
    usage: ["codedecay agent [options]"],
    description: [
      "Generate an agent-facing task bundle from the same deterministic analysis and red-team context used by CodeDecay."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--profile <profile>", description: `${AGENT_PROFILE_IDS.join(", ")} (default: generic)` },
      { flag: "--filter-source <source>", description: "Only include fix tasks from one source such as finding, weak-test, edge-case, memory, pattern, or product-failure" },
      { flag: "--filter-priority <level>", description: "Only include fix tasks with priority low, medium, or high" },
      { flag: "--filter-file <path>", description: "Only include fix tasks tied to a file path" },
      { flag: "--output <path>", description: "Write agent task bundle to a file instead of stdout" }
    ],
    examples: [
      "codedecay agent --profile codex --base main --head HEAD --format markdown",
      "codedecay agent --cwd ../my-repo --profile opencode --format json",
      "codedecay agent --format json --filter-source weak-test --filter-priority high"
    ],
    notes: [
      "Agent bundles package evidence and instructions only. They do not trigger agent or model calls by themselves.",
      "Design contract findings are deterministic evidence and appear in the bundle when `codedecay.contract.*` is configured.",
      "Exit codes stay stable: 0 for a generated bundle, 2 for CLI/internal errors."
    ]
  },
  loop: {
    name: "loop",
    summary: "Closed-loop controller that drives a user-owned agent through fix and re-verify rounds.",
    usage: ["codedecay loop [options]"],
    description: [
      "Run CodeDecay redteam analysis, configured checks, and optionally an explicit local agent command in a safe loop.",
      "Without --agent-cmd, loop runs in plan-only mode and prints the bundle it would send."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--max-rounds <n>", description: "Maximum fix/recheck rounds (default: 4)" },
      { flag: "--agent-cmd <command>", description: "Explicit user-owned agent command that reads the task bundle on stdin and may edit the working tree" },
      { flag: "--safe-risk <level>", description: "Maximum acceptable risk level: low, medium, or high (default: low)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write loop report to a file instead of stdout" }
    ],
    examples: [
      "codedecay loop --format markdown",
      "codedecay loop --agent-cmd \"codex exec --apply\" --max-rounds 3 --format json",
      "codedecay loop --cwd ../my-repo --output codedecay-loop.md"
    ],
    notes: [
      "CodeDecay does not embed a model. The agent command is user-owned and explicit.",
      "The loop never auto-commits or auto-pushes. It leaves edits in the working tree for human review.",
      "Agent output is untrusted. CodeDecay re-runs deterministic analysis and configured checks after each agent action.",
      "Exit codes: 0 for merge-safe or plan-only report generation, 1 for unverified, needs-human, stuck, or agent-error, and 2 for CLI/internal errors."
    ]
  },
  doctor: {
    name: "doctor",
    summary: "Recommend OSS tools and local setup for stronger PR safety evidence.",
    usage: ["codedecay doctor [options]"],
    description: [
      "Inspect the repository shape and recommend mature open-source tools CodeDecay can orchestrate, such as Semgrep, Playwright, StrykerJS, Schemathesis, Pact, coverage tools, OSV-Scanner, and OpenSSF Scorecard."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write doctor report to a file instead of stdout" },
      { flag: "--write-config-preview", description: "Write .codedecay/local/config-preview.yml with suggested adapter config" }
    ],
    examples: [
      "codedecay doctor",
      "codedecay doctor --cwd ../my-repo --format json",
      "codedecay doctor --write-config-preview"
    ],
    notes: [
      "Doctor does not install tools, execute commands, call models, use network access, or change .codedecay/config.yml.",
      "The config preview is written under .codedecay/local/ so users can review it before copying anything into tracked config."
    ]
  },
  execute: {
    name: "execute",
    summary: "Run explicitly configured local checks and tool adapters.",
    usage: ["codedecay execute [options]"],
    description: [
      "Execute only the commands and tool adapters already declared in CodeDecay config, subject to the configured safety gates."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write execution report to a file instead of stdout" }
    ],
    examples: ["codedecay execute --format markdown", "codedecay execute --cwd ../my-repo --format json"],
    notes: [
      "If `safety.allowCommands` is false, configured commands and adapters are reported as skipped instead of executed."
    ]
  },
  differential: {
    name: "differential",
    summary: "Compare configured base/head behavior probes.",
    usage: ["codedecay differential [options]"],
    description: [
      "Run configured probes against temporary worktrees for base and head refs, then report behavioral differences."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from (required)" },
      { flag: "--head <ref>", description: "Head git ref to compare to (required)" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write differential report to a file instead of stdout" }
    ],
    examples: [
      "codedecay differential --base main --head HEAD --format markdown",
      "codedecay differential --cwd ../my-repo --base origin/main --head HEAD --format json"
    ],
    notes: [
      "Differential exits non-zero when probe behavior changes or infrastructure failures occur."
    ]
  },
  mcp: {
    name: "mcp",
    summary: "Start the local MCP server.",
    usage: ["codedecay mcp [options]"],
    description: [
      "Expose CodeDecay analysis capabilities through a local Model Context Protocol server for agent clients."
    ],
    options: [{ flag: "--cwd <path>", description: "Repository working directory exposed to MCP tools" }],
    examples: ["codedecay mcp --cwd ../my-repo"]
  }
};
