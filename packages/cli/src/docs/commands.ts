import { AGENT_PROFILE_IDS } from "@submuxhq/codedecay-agent";
import type { CommandDoc } from "../renderers/discovery";

export const COMMAND_ORDER = ["analyze", "snapshot", "redteam", "llm-review", "agent", "config", "memory", "memory-import", "memory-learn", "execute", "differential", "product", "dashboard", "mcp"] as const;
export const UTILITY_COMMAND_ORDER = ["help", "man", "update", "uninstall", "version"] as const;
export const ROOT_FLAG_ALIASES = ["--help", "-h", "--version", "-V"] as const;

export const HELP_DOCS: Record<string, CommandDoc> = {
  analyze: {
    name: "analyze",
    summary: "Deterministic PR risk, impact, and decay report.",
    usage: ["codedecay analyze [options]"],
    description: [
      "Analyze the current working tree or a base/head git diff and report regression risk, blast radius, missing tests, and maintainability decay."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json, markdown, or sarif (default: markdown)" },
      { flag: "--output <path>", description: "Write report to a file instead of stdout" },
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk" }
    ],
    examples: [
      "codedecay analyze --format markdown",
      "codedecay analyze --base main --head HEAD --format json",
      "codedecay analyze --format sarif --output codedecay.sarif"
    ],
    notes: [
      "When --base/--head are omitted, CodeDecay analyzes the current git working tree.",
      "Relative --output paths resolve from the analyzed repository root."
    ]
  },
  snapshot: {
    name: "snapshot",
    summary: "Stable repository health snapshot and trend comparison.",
    usage: ["codedecay snapshot [options]"],
    description: [
      "Emit a stable JSON or Markdown snapshot for the current PR or working tree, and optionally compare it with a previous snapshot artifact."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--compare <path>", description: "Previous snapshot JSON file to compare against" },
      { flag: "--format <format>", description: "json or markdown (default: json)" },
      { flag: "--output <path>", description: "Write snapshot or comparison output to a file instead of stdout" }
    ],
    examples: [
      "codedecay snapshot --format json --output .codedecay/snapshot.json",
      "codedecay snapshot --base main --head HEAD --compare .codedecay/previous-snapshot.json --format markdown"
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
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk" }
    ],
    examples: [
      "codedecay redteam --base main --head HEAD --format markdown",
      "codedecay redteam --cwd ../my-repo --format json"
    ],
    notes: [
      "Redteam reports do not execute configured commands or call LLMs by default.",
      "Configured checks are described in the report as recommendations unless you run execute or differential explicitly."
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
      { flag: "--output <path>", description: "Write agent task bundle to a file instead of stdout" }
    ],
    examples: [
      "codedecay agent --profile codex --base main --head HEAD --format markdown",
      "codedecay agent --cwd ../my-repo --profile opencode --format json"
    ],
    notes: [
      "Agent bundles package evidence and instructions only. They do not trigger agent or model calls by themselves."
    ]
  },
  config: {
    name: "config",
    summary: "Show normalized CodeDecay config.",
    usage: ["codedecay config [options]"],
    description: [
      "Load repo-local CodeDecay config and render the normalized settings as JSON or markdown."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: json)" }
    ],
    examples: ["codedecay config --format markdown", "codedecay config --cwd ../my-repo --format json"]
  },
  memory: {
    name: "memory",
    summary: "Show local repo memory.",
    usage: ["codedecay memory [options]"],
    description: [
      "Load `.codedecay/memory.json` and render the normalized memory sections used by redteam and agent workflows."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: json)" }
    ],
    examples: ["codedecay memory --format markdown", "codedecay memory --cwd ../my-repo --format json"]
  },
  "memory-import": {
    name: "memory-import",
    summary: "Merge structured CI, incident, or PR learnings into local repo memory.",
    usage: ["codedecay memory-import --input <path> [options]"],
    description: [
      "Load a structured import file, normalize it into CodeDecay memory sections, preview the merged result, and optionally write it to `.codedecay/memory.json`."
    ],
    options: [
      { flag: "--input <path>", description: "JSON file containing memory sections or imported learnings" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown preview format (default: markdown)" },
      { flag: "--apply", description: "Write the merged memory file instead of only printing the preview" }
    ],
    examples: [
      "codedecay memory-import --input .codedecay/import.json",
      "codedecay memory-import --cwd ../my-repo --input incidents.json --apply"
    ]
  },
  "memory-learn": {
    name: "memory-learn",
    summary: "Learn local repo memory from CI, PR, and CodeDecay report signals.",
    usage: ["codedecay memory-learn --input <path> [options]"],
    description: [
      "Convert raw-ish CI failures, merged PR descriptions, commit messages, and CodeDecay fail-on reports into reviewable `.codedecay/memory.json` entries."
    ],
    options: [
      { flag: "--input <path>", description: "JSON file containing ciFailures, pullRequests, reports, failOnReports, or a CodeDecay report" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown preview format (default: markdown)" },
      { flag: "--apply", description: "Write the learned memory file instead of only printing the preview" }
    ],
    examples: [
      "codedecay memory-learn --input ci-failure.json",
      "codedecay memory-learn --input codedecay-report.json --apply"
    ],
    notes: [
      "Learning is deterministic and local. CodeDecay does not inspect remote CI, PRs, or GitHub automatically."
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
  product: {
    name: "product",
    summary: "Check configured live app product targets.",
    usage: ["codedecay product [options]"],
    description: [
      "Inspect configured product testing targets, optionally start local targets when commands are explicitly allowed, and poll their health checks or base URLs."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--target <id>", description: "Run only one configured product target" },
      { flag: "--explore", description: "Use a project-provided Playwright install to crawl same-origin product flows" },
      { flag: "--generate-tests", description: "Generate reviewable Playwright regression tests from the target flow map" },
      { flag: "--run-generated-tests", description: "Run generated Playwright tests through the target repo's local Playwright CLI" },
      { flag: "--generate-api-tests", description: "Generate reviewable API regression tests from a configured OpenAPI schema" },
      { flag: "--run-generated-api-tests", description: "Run generated API tests through the target repo's local Playwright CLI" },
      { flag: "--test-id <id>", description: "When rerunning generated tests, target one generated test ID" },
      { flag: "--fail-on-classification <list>", description: "For product failures, exit non-zero only when a failure bundle has one of these comma-separated classifications" },
      { flag: "--max-pages <count>", description: "Maximum pages to visit during --explore (default: 10)" },
      { flag: "--max-actions <count>", description: "Maximum interactive elements to record during --explore (default: 50)" },
      { flag: "--allow-destructive-actions", description: "Record destructive forms/actions as allowed instead of blocked" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write product target report to a file instead of stdout" }
    ],
    examples: [
      "codedecay product --format markdown",
      "codedecay product --target web --format json",
      "codedecay product --target web --explore --max-pages 5 --format markdown",
      "codedecay product --target web --generate-tests --run-generated-tests --format markdown",
      "codedecay product --target api --generate-api-tests --run-generated-api-tests --format markdown",
      "codedecay product --target api --generate-api-tests --run-generated-api-tests --fail-on-classification confirmed-regression --format markdown",
      "codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
    ],
    notes: [
      "Product target commands run only when they are configured and `safety.allowCommands` is true.",
      "Existing `baseUrl` and preview URL targets are checked without starting commands.",
      "`--explore` is an explicit execution workflow and requires `safety.allowCommands: true` plus a project-provided Playwright install.",
      "Generated tests are written under `.codedecay/local/generated-tests/` and `.codedecay/local/generated-api-tests/` for review; CodeDecay never commits or promotes them automatically."
    ]
  },
  dashboard: {
    name: "dashboard",
    summary: "Generate a static product verification dashboard.",
    usage: ["codedecay dashboard [options]"],
    description: [
      "Discover local product run artifacts, redact sensitive values, and write a static HTML/JSON dashboard with per-failure bundle links."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--input <path>", description: "Additional product report JSON file or directory to include; can be repeated" },
      { flag: "--output <path>", description: "Dashboard output directory (default: .codedecay/local/dashboard)" },
      { flag: "--format <format>", description: "json or markdown summary to stdout (default: markdown)" }
    ],
    examples: [
      "codedecay dashboard",
      "codedecay dashboard --input .codedecay/local/product-trends --output public/codedecay-dashboard",
      "codedecay dashboard --format json"
    ],
    notes: [
      "Default discovery reads `.codedecay/local/product-runs/**/*.json` and `.codedecay/local/product-trends/**/*.json`.",
      "The generated dashboard is static and local-first. It does not upload artifacts or require a hosted service."
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
  },
  help: {
    name: "help",
    summary: "Show root or per-command help.",
    usage: ["codedecay help", "codedecay help <command>"],
    description: [
      "Print concise usage documentation for the whole CLI or for a specific command."
    ],
    options: [],
    examples: ["codedecay help", "codedecay help analyze"],
    notes: [
      "`codedecay <command> --help` prints the same command-specific help text."
    ]
  },
  man: {
    name: "man",
    summary: "Show a longer manual page.",
    usage: ["codedecay man", "codedecay man <command>"],
    description: [
      "Print a fuller manual view with command descriptions, options, examples, and operational notes."
    ],
    options: [],
    examples: ["codedecay man", "codedecay man redteam"]
  },
  update: {
    name: "update",
    summary: "Print or apply the recommended CLI upgrade command.",
    usage: ["codedecay update [options]"],
    description: [
      "Detect the repository package manager and print the safest upgrade command for `@submuxhq/codedecay`. By default this is a dry run."
    ],
    options: [
      { flag: "--cwd <path>", description: "Working directory used for package-manager detection" },
      { flag: "--manager <name>", description: "Override detection with npm, pnpm, yarn, or bun" },
      { flag: "--apply", description: "Execute the recommended upgrade command instead of only printing it" }
    ],
    examples: [
      "codedecay update",
      "codedecay update --cwd ../my-repo",
      "codedecay update --manager pnpm --apply"
    ],
    notes: [
      "Update never executes automatically. You must pass --apply to run the package-manager command."
    ]
  },
  uninstall: {
    name: "uninstall",
    summary: "Print or apply the recommended uninstall and cleanup plan.",
    usage: ["codedecay uninstall [options]"],
    description: [
      "Detect the repository package manager and print the safest removal command for `@submuxhq/codedecay`. Optionally purge repo-local CodeDecay state and generated artifacts."
    ],
    options: [
      { flag: "--cwd <path>", description: "Working directory used for package-manager detection" },
      { flag: "--manager <name>", description: "Override detection with npm, pnpm, yarn, or bun" },
      { flag: "--purge-local", description: "Also remove local `.codedecay/` state and detected CodeDecay report artifacts" },
      { flag: "--apply", description: "Execute the uninstall and optional purge instead of only printing the plan" }
    ],
    examples: [
      "codedecay uninstall",
      "codedecay uninstall --cwd ../my-repo --purge-local",
      "codedecay uninstall --manager pnpm --purge-local --apply"
    ],
    notes: [
      "Uninstall does not rewrite CI workflows, docs links, or other user-authored references automatically."
    ]
  },
  version: {
    name: "version",
    summary: "Print the installed CodeDecay version.",
    usage: ["codedecay version", "codedecay --version"],
    description: [
      "Print the CLI version bundled into the current CodeDecay build."
    ],
    options: [],
    examples: ["codedecay version", "codedecay --version"]
  }
};
