import type { CommandDoc } from "../../renderers/discovery";

export const UTILITY_COMMAND_DOCS: Record<string, CommandDoc> = {
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
