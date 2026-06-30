import type { CommandDoc } from "../../renderers/discovery";

export const ANALYSIS_COMMAND_DOCS: Record<string, CommandDoc> = {
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
