import type { CommandDoc } from "../../renderers/discovery";

export const STATE_COMMAND_DOCS: Record<string, CommandDoc> = {
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
    usage: [
      "codedecay memory [options]",
      "codedecay memory setup [options]",
      "codedecay memory learning --action <action> [options]"
    ],
    description: [
      "Load `.codedecay/memory.json` and render the normalized memory sections used by redteam and agent workflows.",
      "`codedecay memory setup` prints safe setup guidance for local, Mem0, and Supermemory providers without installing packages or touching tracked config.",
      "`codedecay memory learning` proposes or reviews versioned learning events (approve/reject/supersede/expire/revoke) without auto-approving untrusted sources."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: json for memory, markdown for setup)" },
      { flag: "setup --provider <provider>", description: "local, mem0, supermemory, or all (default: all)" },
      { flag: "setup --apply", description: "Write .codedecay/local/memory-providers.yml review snippet" },
      { flag: "learning --action <action>", description: "propose|approve|reject|supersede|expire|revoke" },
      { flag: "learning --event-id <id>", description: "Existing learning event id (required except propose)" },
      { flag: "learning --input <path>", description: "JSON learning event proposal (required for propose)" },
      { flag: "learning --actor <name>", description: "Reviewer/proposer identity (default: maintainer)" },
      { flag: "learning --reason <text>", description: "Audit reason for the operation" },
      { flag: "learning --evidence-id <id>", description: "Optional evidence id (repeatable)" },
      { flag: "learning --apply", description: "Write `.codedecay/memory.json` instead of preview only" }
    ],
    examples: [
      "codedecay memory --format markdown",
      "codedecay memory --cwd ../my-repo --format json",
      "codedecay memory setup --provider all",
      "codedecay memory setup --provider supermemory --apply",
      "codedecay memory learning --action propose --input learning.json",
      "codedecay memory learning --action approve --event-id learn_abc --apply"
    ],
    notes: [
      "Memory setup is preview-only by default. It does not install packages, call providers, or edit `.codedecay/config.yml`.",
      "Learning events stay proposed until an explicit approve/reject/supersede/expire/revoke operation."
    ]
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
    summary: "Learn local repo memory proposals from CI, PR, incident, and CodeDecay report signals.",
    usage: ["codedecay memory-learn --input <path> [options]"],
    description: [
      "Convert raw-ish CI failures, merged PR descriptions, incident markdown, commit messages, and CodeDecay fail-on reports into reviewable `.codedecay/memory.json` proposals."
    ],
    options: [
      { flag: "--input <path>", description: "JSON or markdown file containing ciFailures, pullRequests, incidents, reports, failOnReports, or a CodeDecay report" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown preview format (default: markdown)" },
      { flag: "--apply", description: "Write the learned memory file instead of only printing the preview" }
    ],
    examples: [
      "codedecay memory-learn --input ci-failure.json",
      "codedecay memory-learn --input incidents/auth-outage.md",
      "codedecay memory-learn --input codedecay-report.json --apply"
    ],
    notes: [
      "Learning is deterministic and local. CodeDecay does not inspect remote CI, PRs, or GitHub automatically.",
      "Preview output includes proposals with source, confidence, timestamp, and why before --apply writes memory."
    ]
  }
};
