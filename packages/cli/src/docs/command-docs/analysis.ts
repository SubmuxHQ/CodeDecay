import type { CommandDoc } from "../../renderers/discovery";

export const ANALYSIS_COMMAND_DOCS: Record<string, CommandDoc> = {
  migration: {
    name: "migration",
    summary: "Plan schema migration and mixed-version safety checks.",
    usage: ["codedecay migration [options]"],
    description: ["Parse repo-local PostgreSQL or Prisma migration SQL, identify destructive and backfill risks, and emit a five-state deployment compatibility matrix without contacting a database."],
    options: [
      { flag: "--file <path>", description: "Repo-local migration SQL file; repeat for multiple files" },
      { flag: "--rollback-file <path>", description: "Repo-local rollback SQL file; repeat for multiple files" },
      { flag: "--target-kind <kind>", description: "unspecified, disposable-local, remote-unapproved, or production-like" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write the plan to a file instead of stdout" }
    ],
    examples: ["codedecay migration --file prisma/migrations/20260802_change/migration.sql --target-kind disposable-local", "codedecay migration --file migration.sql --target-kind production-like --format json"],
    notes: ["This command is plan-only: it reads no database secret, contacts no database, and applies no migration."]
  },
  runtime: {
    name: "runtime",
    summary: "Ingest local runtime exports as redacted engineering evidence.",
    usage: ["codedecay runtime [options]"],
    description: ["Read local OTLP JSON traces and structured error exports, correlate them with an optional service topology, and emit revision-aware investigation evidence."],
    options: [
      { flag: "--telemetry <path>", description: "Repo-local OTLP JSON trace export" },
      { flag: "--errors <path>", description: "Repo-local structured error export" },
      { flag: "--topology <path>", description: "Optional repo-local service topology manifest" },
      { flag: "--head-revision <revision>", description: "Current source revision used to classify evidence trust" },
      { flag: "--environment <name>", description: "Environment label when an export omits one" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write evidence report to a file instead of stdout" }
    ],
    examples: [
      "codedecay runtime --telemetry .codedecay/runtime/traces.json --head-revision $(git rev-parse HEAD)",
      "codedecay runtime --errors .codedecay/runtime/errors.json --format json"
    ],
    notes: ["Inputs must resolve inside the repository. The command performs no network calls or project command execution."]
  },
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
      { flag: "--format <format>", description: "json, markdown, sarif, or pr-comment (default: markdown)" },
      { flag: "--output <path>", description: "Write report to a file instead of stdout" },
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk" },
      { flag: "--task <text>", description: "Task description used with a structured requirements artifact" },
      { flag: "--requirements <path>", description: "Repo-local JSON, YAML, or Markdown requirements artifact" },
      { flag: "--fail-on-requirements", description: "Exit non-zero when any supplied acceptance criterion is not verified" }
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
  benchmark: {
    name: "benchmark",
    summary: "Reproducible planted-issue catch-rate and false-positive benchmark.",
    usage: ["codedecay benchmark [options]"],
    description: [
      "Run the deterministic planted-issue corpus and clean decoys, then print real recall, precision, and false-positive metrics."
    ],
    options: [
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write benchmark report to a file instead of stdout" },
      { flag: "--corpus <path>", description: "default or a local corpus manifest path/directory" }
    ],
    examples: [
      "codedecay benchmark",
      "codedecay benchmark --format json",
      "codedecay benchmark --format markdown --output codedecay-benchmark.md"
    ],
    notes: [
      "The default corpus runs offline in temporary git repositories.",
      "Benchmark summaries always report costUsd: 0, llmCalled: false, and telemetrySent: false for the deterministic corpus."
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
  }
};
