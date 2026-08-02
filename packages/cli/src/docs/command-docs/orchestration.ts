import { AGENT_PROFILE_IDS } from "@submuxhq/codedecay-agent";
import type { CommandDoc } from "../../renderers/discovery";

export const ORCHESTRATION_COMMAND_DOCS: Record<string, CommandDoc> = {
  ai: {
    name: "ai",
    summary: "AI-first PR safety workflow for Codex, Claude Code, Cursor, and local agent loops.",
    usage: ["codedecay ai [options]", "codedecay ai preflight --task <description> [options]"],
    description: [
      "Generate a Codex-ready task bundle by red-teaming the diff, loading requirements, local memory, and repo skills, auditing tests, and packaging concrete proof and repair tasks for a user-owned agent.",
      "Use `ai preflight` before code generation to give the agent grounded likely files, routes, constraints, unresolved questions, and proof expectations without requiring a git diff."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--profile <profile>", description: `${AGENT_PROFILE_IDS.join(", ")} (default: codex)` },
      { flag: "--task <text>", description: "Required for `ai preflight`; optional post-diff task context" },
      { flag: "--requirements <path>", description: "Optional repo-local JSON, YAML, or Markdown requirements artifact" },
      { flag: "--investigate", description: "Explicitly call the configured local/BYOK provider and include untrusted grounded suggestions" },
      { flag: "--filter-source <source>", description: "Only include fix tasks from one source such as finding, weak-test, edge-case, test-proof, or product-failure" },
      { flag: "--filter-priority <level>", description: "Only include fix tasks with priority low, medium, or high" },
      { flag: "--filter-file <path>", description: "Only include fix tasks tied to a file path" },
      { flag: "--with-checks", description: "Run configured commands and tool adapters through safety gates after code changes" },
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk after writing the bundle" },
      { flag: "--fail-on-requirements", description: "Exit non-zero when supplied acceptance criteria remain blocking after writing the bundle" },
      { flag: "--output <path>", description: "Write the task bundle to a file instead of stdout" }
    ],
    examples: [
      "codedecay ai preflight --task \"Add a GET /api/users export endpoint\" --format markdown",
      "codedecay ai --base main --head HEAD --format markdown",
      "codedecay ai --profile claude-code --requirements .codedecay/requirements.yml --format markdown",
      "codedecay ai --with-checks --base main --head HEAD --format markdown"
    ],
    notes: [
      "The default workflow packages deterministic evidence for a user-owned agent. It does not call Codex, Claude Code, Cursor, hosted models, or CodeDecayCloud.",
      "Use --investigate only when you explicitly want the configured local/BYOK provider to produce untrusted suggestions.",
      "Use --with-checks only after edits when you want configured local commands and OSS adapters to produce verification evidence.",
      "Failed or blocked checks and configured risk/requirement gates exit non-zero after the bundle is written."
    ]
  },
  context: {
    name: "context",
    summary: "Retrieve bounded task-scoped engineering context for user-owned agents.",
    usage: ["codedecay context --task <description> [options]"],
    description: [
      "Build an inspectable task-scoped context packet from existing CodeDecay evidence: requirements, impact graph nodes, route/API evidence, symbols, tests, memory, docs/ADRs, CODEOWNERS, config, package manifests, and verification evidence.",
      "Use this before or during implementation when an agent needs the smallest relevant set of repository facts and historical context instead of a whole-repo dump."
    ],
    options: [
      { flag: "--task <text>", description: "Required task/change description used for deterministic retrieval" },
      { flag: "--requirements <path>", description: "Optional repo-local JSON, YAML, or Markdown requirements artifact" },
      { flag: "--base <ref>", description: "Base git ref to compare from when a diff should influence context" },
      { flag: "--head <ref>", description: "Head git ref to compare to when a diff should influence context" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--max-nodes <n>", description: "Maximum selected context nodes (default: 24)" },
      { flag: "--output <path>", description: "Write the task context packet to a file instead of stdout" }
    ],
    examples: [
      "codedecay context --task \"Allow finance admins to retry failed payouts\" --format markdown",
      "codedecay context --task \"Change payout retry formatting\" --base main --head HEAD --format json",
      "codedecay context --task \"Add billing export\" --requirements .codedecay/requirements.yml --max-nodes 16"
    ],
    notes: [
      "Context retrieval is deterministic lexical plus graph-neighbor ranking. It does not call models, embeddings, hosted services, network APIs, or telemetry.",
      "The command refreshes local analysis artifacts but does not execute configured project commands or tool adapters.",
      "Memory and documents are shown with trust class and limitations; they cannot become trusted proof without current-revision evidence.",
      "The inspectable artifact is written to `.codedecay/local/task-context.json`."
    ]
  },
  session: {
    name: "session",
    summary: "Continuous before-during-after guidance sessions for user-owned agents.",
    usage: [
      "codedecay session start --task <description> [options]",
      "codedecay session context --session <id> [options]",
      "codedecay session checkpoint --session <id> [options]",
      "codedecay session finish --session <id> [options]"
    ],
    description: [
      "Create a durable agent-session artifact that carries task requirements, base revision, context evidence, checkpoints, and proof obligations across planning, edits, and final verification.",
      "Use this as the primary AI-native path when a coding agent needs grounded guidance before editing, during partial work, and at finish time."
    ],
    options: [
      { flag: "--session <id>", description: "Stable session id. Optional for start, required for context/checkpoint/finish" },
      { flag: "--task <text>", description: "Required for start; intended task/change description before code generation" },
      { flag: "--requirements <path>", description: "Optional repo-local JSON, YAML, or Markdown requirements artifact for start" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--profile <profile>", description: `${AGENT_PROFILE_IDS.join(", ")} (default: generic)` },
      { flag: "--max-nodes <n>", description: "Context node budget for start/context (default: 24)" },
      { flag: "--max-chars <n>", description: "Prompt character budget stored in the session (default: 24000)" },
      { flag: "--kind <kind>", description: "Checkpoint kind: plan or diff (default: plan)" },
      { flag: "--summary <text>", description: "Agent-authored checkpoint or finish summary stored as untrusted data" },
      { flag: "--agent-output <text>", description: "Optional agent-authored details stored as untrusted, redacted data" },
      { flag: "--output <path>", description: "Write session result to a file instead of stdout" }
    ],
    examples: [
      "codedecay session start --session billing-retry --task \"Allow finance admins to retry failed payouts\"",
      "codedecay session context --session billing-retry --format json",
      "codedecay session checkpoint --session billing-retry --kind diff --summary \"Retry route implemented\"",
      "codedecay session finish --session billing-retry --format markdown"
    ],
    notes: [
      "Session lifecycle operations do not call models, execute configured commands, use network access, send telemetry, commit, push, install tools, or silently overwrite an existing session id.",
      "Context refresh writes `.codedecay/local/task-context.json` and records an evidence ref in `.codedecay/local/agent-sessions/<id>.json`.",
      "CodeDecay detects when the working tree changed since the last session observation and asks for a checkpoint before prior guidance is trusted.",
      "Agent-authored summaries are redacted and treated as untrusted data; they cannot resolve business decisions or prove requirements."
    ]
  },
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
      { flag: "--task <text>", description: "Task description used with a structured requirements artifact" },
      { flag: "--requirements <path>", description: "Repo-local JSON, YAML, or Markdown requirements artifact" },
      { flag: "--fail-on-requirements", description: "Exit non-zero when any supplied acceptance criterion is not verified" },
      { flag: "--with-checks", description: "Run configured commands and tool adapters through safety gates and include verification evidence" },
      { flag: "--investigate", description: "Explicitly run the configured local/BYOK LLM provider for untrusted suggestions" }
    ],
    examples: [
      "codedecay redteam --base main --head HEAD --format markdown",
      "codedecay redteam --with-checks --base main --head HEAD --format markdown",
      "codedecay redteam --investigate --base main --head HEAD --format markdown",
      "codedecay redteam --cwd ../my-repo --format json"
    ],
    notes: [
      "Redteam reports do not execute configured commands or call LLMs by default. Use --with-checks to opt into configured local checks, and --investigate to opt into the configured LLM provider.",
      "Verification status is reported as verified, unverified, failed, or blocked so heuristic risk is not confused with behavioral proof.",
      "With --with-checks, failed or blocked verification exits 1 after the report is written."
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
      "This command is explicit opt-in. Deterministic ai, analyze, redteam, agent, and snapshot commands do not call models by default.",
      "LLM suggestions are untrusted until verified by tests, configured checks, or manual review."
    ]
  },
  agent: {
    name: "agent",
    summary: "Preflight guidance and task bundles for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients.",
    usage: ["codedecay agent [options]", "codedecay agent preflight --task <description> [options]"],
    description: [
      "Generate an agent-facing task bundle from the same deterministic analysis and red-team context used by CodeDecay.",
      "Use `agent preflight` before code generation to give a user-owned agent repo-grounded likely files, routes, memory, design constraints, and proof expectations without requiring a git diff."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--profile <profile>", description: `${AGENT_PROFILE_IDS.join(", ")} (default: generic)` },
      { flag: "--task <text>", description: "Required for `agent preflight`; intended task/change description before code generation" },
      { flag: "--requirements <path>", description: "Optional repo-local JSON or YAML requirements artifact with acceptance criteria and affected flows" },
      { flag: "--investigate", description: "Explicitly call the configured local/BYOK provider and include untrusted grounded suggestions" },
      { flag: "--filter-source <source>", description: "Only include fix tasks from one source such as finding, weak-test, edge-case, test-proof, or product-failure" },
      { flag: "--filter-priority <level>", description: "Only include fix tasks with priority low, medium, or high" },
      { flag: "--filter-file <path>", description: "Only include fix tasks tied to a file path" },
      { flag: "--output <path>", description: "Write agent task bundle to a file instead of stdout" }
    ],
    examples: [
      "codedecay agent preflight --task \"Add a GET /api/users export endpoint\" --format markdown",
      "codedecay agent preflight --task \"Add billing export\" --requirements .codedecay/requirements.yml --format markdown",
      "codedecay agent --investigate --task \"Review billing export regressions\" --requirements .codedecay/requirements.yml --format json",
      "codedecay agent --profile codex --base main --head HEAD --format markdown",
      "codedecay agent --cwd ../my-repo --profile opencode --format json",
      "codedecay agent --format json --filter-source weak-test --filter-priority high"
    ],
    notes: [
      "Agent preflight and agent bundles package evidence and instructions only. They do not trigger agent or model calls by themselves.",
      "Preflight does not require changed files and does not run configured commands; it lists follow-up proof checks with willRun=false.",
      "Requirement evidence retains source ids and is rendered separately from CodeDecay suggestions.",
      "Investigation is opt-in, uses only the explicitly configured provider, and cannot change deterministic risk or prove safety.",
      "Design contract findings are deterministic evidence and appear in the bundle when `codedecay.contract.*` is configured.",
      "Exit codes stay stable: 0 for a generated bundle, 2 for CLI/internal errors."
    ]
  },
  loop: {
    name: "loop",
    summary: "Closed-loop controller that drives a user-owned agent through fix and re-verify rounds.",
    usage: ["codedecay loop [options]"],
    description: [
      "Run CodeDecay redteam analysis, configured checks, and optionally explicit user-owned builder and verifier commands in a safe loop.",
      "Without --builder-cmd or legacy --agent-cmd, loop runs in plan-only mode and prints the bundle it would send."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--max-rounds <n>", description: "Maximum fix/recheck rounds (default: 4)" },
      { flag: "--agent-cmd <command>", description: "Legacy alias for --builder-cmd" },
      { flag: "--builder-cmd <command>", description: "Explicit user-owned builder command that reads the task bundle on stdin and may edit the working tree" },
      { flag: "--verifier-cmd <command>", description: "Explicit user-owned verifier command that challenges the current tree but must not edit files" },
      { flag: "--builder-id <id>", description: "Identity label recorded for the builder role" },
      { flag: "--verifier-id <id>", description: "Identity label recorded for the verifier role" },
      { flag: "--safe-risk <level>", description: "Maximum acceptable risk level: low, medium, or high (default: low)" },
      { flag: "--max-security-score <score>", description: "Maximum acceptable security score from deterministic analysis, 0-100 (default: 0)" },
      { flag: "--task <text>", description: "Task description used with a structured requirements artifact" },
      { flag: "--requirements <path>", description: "Preserve acceptance-criteria IDs and trace status across loop rounds" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write loop report to a file instead of stdout" }
    ],
    examples: [
      "codedecay loop --format markdown",
      "codedecay loop --builder-cmd \"codex exec --apply\" --verifier-cmd \"codex exec\" --max-rounds 3 --format json",
      "codedecay loop --cwd ../my-repo --output codedecay-loop.md"
    ],
    notes: [
      "CodeDecay does not embed a model. Builder and verifier commands are user-owned and explicit.",
      "The verifier receives current-tree evidence and limitations, not the builder's hidden reasoning or an expected answer.",
      "Verifier output can propose hypotheses and proof tasks, but only trusted deterministic, OSS-tool, or runtime evidence can verify criteria.",
      "The loop never auto-commits or auto-pushes. It leaves edits in the working tree for human review.",
      "Agent output is untrusted. CodeDecay re-runs deterministic analysis and configured checks after each agent action.",
      "Terminal clean verdicts are always qualified: merge-safe-verified has configured checks plus security/coverage/mutation depth, while merge-safe-shallow passed gates but is missing deeper evidence.",
      "Exit codes: 0 for merge-safe-verified, merge-safe-shallow, or plan-only report generation; 1 for unverified, needs-human, budget-exhausted, unsafe-change, stuck, builder-error, verifier-error, or agent-error; and 2 for CLI/internal errors."
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
      "If `safety.allowCommands` is false, configured commands and adapters are reported as skipped instead of executed.",
      "Unsafe configured commands are reported as blocked, not skipped."
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
