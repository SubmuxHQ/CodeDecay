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
      { flag: "--connection-url <url>", description: "Optional DB URL used only for host classification; secret values are redacted" },
      { flag: "--connection-host <host>", description: "Optional DB host used for target classification" },
      { flag: "--database-url-env <NAME>", description: "Env var name holding credentials; values are never read" },
      { flag: "--cleanup-plan <text>", description: "Disposable database cleanup plan recorded in the report" },
      { flag: "--rollback-failed", description: "Mark rollback as failed so the verdict stays not fully verified" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write the plan to a file instead of stdout" }
    ],
    examples: [
      "codedecay migration --file prisma/migrations/20260802_change/migration.sql --target-kind disposable-local",
      "codedecay migration --file migration.sql --connection-host localhost --cleanup-plan \"drop docker volume codedecay-mig\" --format json"
    ],
    notes: [
      "This command is plan-only: it reads no database secret, contacts no database, and applies no migration.",
      "See docs/migration.md for what plan-ready vs fully-verified means."
    ]
  },
  concurrency: {
    name: "concurrency",
    summary: "Plan and evaluate deterministic concurrency/idempotency oracles.",
    usage: ["codedecay concurrency [options]"],
    description: [
      "Load a seeded concurrency experiment fixture, detect candidate surfaces, enforce disposable bounds, and evaluate duplicate-delivery / lost-update oracles without spawning a scheduler or contacting production queues."
    ],
    options: [
      { flag: "--experiment <path>", description: "Repo-local concurrency experiment JSON fixture" },
      { flag: "--surface <path>", description: "Source file to scan for concurrency candidates; repeatable" },
      { flag: "--target-kind <kind>", description: "fixture-local | disposable-local | remote-unapproved | production-like | unspecified" },
      { flag: "--cleanup-plan <text>", description: "Disposable target cleanup plan" },
      { flag: "--cwd <path>", description: "Working directory" },
      { flag: "--format <json|markdown>", description: "Output format" },
      { flag: "--output <path>", description: "Write report to a file" }
    ],
    examples: [
      "codedecay concurrency --experiment .codedecay/concurrency/duplicate.json --surface src/jobs/payout.ts",
      "codedecay concurrency --experiment experiment.json --target-kind fixture-local --format json"
    ],
    notes: [
      "This command is oracle/plan-only: it does not run parallel load generators or touch production queues.",
      "Stress-only results stay inconclusive. See docs/concurrency.md."
    ]
  },
  "state-space": {
    name: "state-space",
    summary: "Plan and evaluate bounded cache/feature-flag state matrices.",
    usage: ["codedecay state-space [options]"],
    description: [
      "Load a seeded state-space experiment fixture, detect cache/flag candidates, generate bounded pairwise or explicit combinations, and evaluate stale-cache / flag-interaction oracles without contacting remote providers by default."
    ],
    options: [
      { flag: "--experiment <path>", description: "Repo-local state-space experiment JSON fixture" },
      { flag: "--surface <path>", description: "Source file to scan for state dimensions; repeatable" },
      { flag: "--target-kind <kind>", description: "fixture-local | disposable-local | remote-unapproved | production-like | unspecified" },
      { flag: "--cleanup-plan <text>", description: "Disposable target cleanup plan" },
      { flag: "--cwd <path>", description: "Working directory" },
      { flag: "--format <json|markdown>", description: "Output format" },
      { flag: "--output <path>", description: "Write report to a file" }
    ],
    examples: [
      "codedecay state-space --experiment .codedecay/state-space/stale-cache.json --surface src/cache/profile.ts",
      "codedecay state-space --experiment experiment.json --target-kind fixture-local --format json"
    ],
    notes: [
      "Coverage is bounded and never implies exhaustive proof. See docs/state-space.md.",
      "Remote flag providers stay blocked unless explicitly configured."
    ]
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
    notes: [
      "Inputs must resolve inside the repository. The command performs no network calls or project command execution.",
      "Historical or sampled runtime evidence cannot prove the current tree safe. See docs/runtime.md."
    ]
  },
  topology: {
    name: "topology",
    summary: "Model cross-repository services and deployment dependencies.",
    usage: ["codedecay topology [options]"],
    description: [
      "Load a reviewable topology manifest plus local OpenAPI/AsyncAPI contracts, merge repository-local graph evidence, and report downstream consumers, owners, deployments, and verification gaps.",
      "Local-only: no repository cloning, remote $ref fetch, network discovery, model calls, installs, or telemetry."
    ],
    options: [
      { flag: "--manifest <path>", description: "Repo-local topology YAML/JSON manifest" },
      { flag: "--openapi <path>", description: "Repo-local OpenAPI 3 contract; repeatable" },
      { flag: "--asyncapi <path>", description: "Repo-local AsyncAPI 2/3 contract; repeatable" },
      { flag: "--local-graph <path>", description: "Optional engineering/impact graph JSON to link as contains edges" },
      { flag: "--changed <node-id>", description: "Changed topology node id; repeatable" },
      { flag: "--invalidate <path>", description: "Contract/manifest path to incrementally rebuild; repeatable" },
      { flag: "--repository-id <id>", description: "Repository id stamped onto contract-derived nodes" },
      { flag: "--revision <rev>", description: "Source revision stamped onto contract-derived nodes" },
      { flag: "--producer-service <id>", description: "Optional service id that produces OpenAPI operations" },
      { flag: "--publisher-service <id>", description: "Optional service id that publishes AsyncAPI channels" },
      { flag: "--subscriber-service <id>", description: "Optional service id that subscribes to AsyncAPI channels" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write the topology report to a file instead of stdout" }
    ],
    examples: [
      "codedecay topology --manifest topology.yml --changed api:billing:v1 --format json",
      "codedecay topology --manifest topology.yml --openapi docs/openapi.yaml --asyncapi docs/asyncapi.yaml --invalidate docs/openapi.yaml"
    ],
    notes: [
      "Stale and inferred dependencies remain untrusted and emit corroboration tasks instead of merge-safe proof.",
      "Normalized artifacts are written to `.codedecay/local/service-topology.json`."
    ]
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
