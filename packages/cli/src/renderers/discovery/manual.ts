import { appendCommandSummaries, appendOptionDocs } from "./format";
import type { CommandDoc } from "./types";

export function renderRootManual(input: {
  docs: Record<string, CommandDoc>;
  commandOrder: readonly string[];
  utilityCommandOrder: readonly string[];
}): string {
  const lines = [
    "CODEDECAY(1)",
    "",
    "NAME",
    "  codedecay - deterministic PR regression-risk and code-decay CLI",
    "",
    "SYNOPSIS",
    "  codedecay <command> [options]",
    "",
    "DESCRIPTION",
    "  CodeDecay is a local-first CLI for regression-risk analysis, blast-radius mapping, maintainability decay detection, weak-test auditing, and agent handoff workflows.",
    "  It does not require hosted services or hidden model calls to produce the core analysis.",
    "",
    "DISCOVERY",
    "  codedecay help <command>   Show concise command help",
    "  codedecay man <command>    Show a longer command manual",
    "  codedecay version          Print the installed version",
    "  codedecay update           Print the recommended upgrade command",
    "  codedecay uninstall       Print the recommended uninstall and cleanup plan",
    "",
    "COMMANDS"
  ];

  appendCommandSummaries(lines, input.docs, input.commandOrder);

  lines.push("", "UTILITIES");
  appendCommandSummaries(lines, input.docs, input.utilityCommandOrder);

  lines.push(
    "",
    "SAFETY",
    "  CodeDecay does not execute project commands unless they are explicitly configured and allowed by repo-local safety settings.",
    "  Redteam and agent workflows package evidence and recommendations without executing configured checks by default.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

export function renderCommandManual(doc: CommandDoc): string {
  const lines = [
    `CODEDECAY-${doc.name.toUpperCase()}(1)`,
    "",
    "NAME",
    `  codedecay ${doc.name} - ${doc.summary.toLowerCase()}`,
    "",
    "SYNOPSIS"
  ];

  for (const usage of doc.usage) {
    lines.push(`  ${usage}`);
  }

  if (doc.description.length > 0) {
    lines.push("", "DESCRIPTION");
    for (const paragraph of doc.description) {
      lines.push(`  ${paragraph}`);
    }
  }

  if (doc.options.length > 0) {
    lines.push("", "OPTIONS");
    appendOptionDocs(lines, doc.options);
  }

  if (doc.examples.length > 0) {
    lines.push("", "EXAMPLES");
    for (const example of doc.examples) {
      lines.push(`  ${example}`);
    }
  }

  if (doc.notes && doc.notes.length > 0) {
    lines.push("", "NOTES");
    for (const note of doc.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
