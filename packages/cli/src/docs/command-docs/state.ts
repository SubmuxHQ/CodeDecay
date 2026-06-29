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
  }
};
