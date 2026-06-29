import { appendCommandSummaries, appendOptionDocs } from "./format";
import type { CommandDoc } from "./types";

export function renderRootHelp(input: {
  docs: Record<string, CommandDoc>;
  commandOrder: readonly string[];
  utilityCommandOrder: readonly string[];
}): string {
  const lines = [
    "CodeDecay",
    "",
    "Find what your coding agent missed before merge.",
    "",
    "Usage:",
    "  codedecay <command> [options]",
    "  codedecay help [command]",
    "  codedecay man [command]",
    "  codedecay update [options]",
    "  codedecay uninstall [options]",
    "  codedecay version",
    "",
    "Commands:"
  ];

  appendCommandSummaries(lines, input.docs, input.commandOrder);

  lines.push("", "Utilities:");
  appendCommandSummaries(lines, input.docs, input.utilityCommandOrder);

  lines.push(
    "",
    "Global flags:",
    "  -h, --help                 Show help",
    "  -V, --version              Print the installed CodeDecay version",
    "",
    "Examples:",
    "  codedecay analyze --base main --head HEAD --format markdown",
    "  codedecay redteam --base main --head HEAD --format markdown",
    "  codedecay agent --profile codex --format markdown",
    "  codedecay help analyze",
    "  codedecay uninstall --purge-local",
    "  codedecay man update",
    "",
    'Run "codedecay help <command>" for command-specific flags.'
  );

  return `${lines.join("\n")}\n`;
}

export function renderCommandHelp(doc: CommandDoc): string {
  const lines = [
    `CodeDecay ${doc.name}`,
    "",
    `${doc.summary}`,
    "",
    "Usage:"
  ];

  for (const usage of doc.usage) {
    lines.push(`  ${usage}`);
  }

  if (doc.description.length > 0) {
    lines.push("", "Description:");
    for (const paragraph of doc.description) {
      lines.push(`  ${paragraph}`);
    }
  }

  if (doc.options.length > 0) {
    lines.push("", "Options:");
    appendOptionDocs(lines, doc.options);
  }

  if (doc.examples.length > 0) {
    lines.push("", "Examples:");
    for (const example of doc.examples) {
      lines.push(`  ${example}`);
    }
  }

  if (doc.notes && doc.notes.length > 0) {
    lines.push("", "Notes:");
    for (const note of doc.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
