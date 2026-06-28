export interface HelpOptionDoc {
  flag: string;
  description: string;
}

export interface CommandDoc {
  name: string;
  summary: string;
  usage: string[];
  description: string[];
  options: HelpOptionDoc[];
  examples: string[];
  notes?: string[];
}

export interface UpdatePlanView {
  manager?: string | undefined;
  source: string;
  displayCommand: string;
  canApply: boolean;
}

export interface UninstallPlanView {
  manager?: string | undefined;
  source: string;
  displayCommand?: string | undefined;
  dependencyLocation: "devDependencies" | "dependencies" | "optionalDependencies" | "none";
  dependencyVersion?: string | undefined;
  purgeTargets: string[];
  canApplyPackage: boolean;
}

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

export function renderVersion(version: string): string {
  return `${version}\n`;
}

export function renderUpdatePlan(input: {
  version: string;
  cwd: string;
  plan: UpdatePlanView;
  apply: boolean;
}): string {
  const lines = [
    "CodeDecay update",
    "",
    `Current CLI version: ${input.version}`,
    `Working directory: ${input.cwd}`
  ];

  if (input.plan.manager) {
    lines.push(`Package manager: ${input.plan.manager} (${input.plan.source})`);
  } else {
    lines.push("Package manager: not detected");
  }

  lines.push("", "Recommended command:", `  ${input.plan.displayCommand}`);

  if (input.apply) {
    lines.push("");
    if (input.plan.canApply) {
      lines.push("Applying update command...");
    } else {
      lines.push("Automatic apply is unavailable for this update plan.");
    }
  } else {
    lines.push("", 'Run "codedecay update --apply" to execute it automatically.');
  }

  return `${lines.join("\n")}\n`;
}

export function renderUninstallPlan(input: {
  version: string;
  packageName: string;
  cwd: string;
  plan: UninstallPlanView;
  apply: boolean;
  purgeLocal: boolean;
}): string {
  const lines = [
    "CodeDecay uninstall",
    "",
    `Current CLI version: ${input.version}`,
    `Working directory: ${input.cwd}`
  ];

  if (input.plan.manager) {
    lines.push(`Package manager: ${input.plan.manager} (${input.plan.source})`);
  } else {
    lines.push("Package manager: not detected");
  }

  const location =
    input.plan.dependencyLocation === "none"
      ? "not listed in package.json"
      : `${input.plan.dependencyLocation}${input.plan.dependencyVersion ? ` (${input.plan.dependencyVersion})` : ""}`;
  lines.push(`Package entry: ${location}`);

  lines.push("");
  if (input.plan.displayCommand) {
    lines.push("Recommended uninstall command:", `  ${input.plan.displayCommand}`);
  } else {
    lines.push(`No supported package manager command detected for ${input.packageName}.`);
  }

  lines.push("");
  if (input.purgeLocal) {
    lines.push("Local purge targets:");
    if (input.plan.purgeTargets.length === 0) {
      lines.push("  none detected");
    } else {
      for (const target of input.plan.purgeTargets) {
        lines.push(`  ${target}`);
      }
    }
  } else {
    lines.push("Local purge targets: skipped");
    lines.push('  Pass "--purge-local" to also remove `.codedecay/` and detected CodeDecay report artifacts.');
  }

  lines.push(
    "",
    "Notes:",
    "  - Uninstall does not rewrite CI workflows, package scripts, or docs references automatically.",
    "  - Review GitHub Actions and README snippets manually if this repo integrated CodeDecay there."
  );

  if (input.apply) {
    lines.push("");
    if (input.plan.canApplyPackage || (input.purgeLocal && input.plan.purgeTargets.length > 0)) {
      lines.push("Applying uninstall plan...");
    } else {
      lines.push("Automatic apply is unavailable for this uninstall plan.");
    }
  } else {
    lines.push("", 'Run "codedecay uninstall --apply" to execute the plan.');
  }

  return `${lines.join("\n")}\n`;
}

function appendCommandSummaries(lines: string[], docs: Record<string, CommandDoc>, commands: readonly string[]): void {
  for (const command of commands) {
    const doc = docs[command];
    if (!doc) {
      throw new Error(`Missing CLI help documentation for ${command}.`);
    }

    lines.push(`  ${doc.name.padEnd(12)} ${doc.summary}`);
  }
}

function appendOptionDocs(lines: string[], options: HelpOptionDoc[]): void {
  const width = Math.max(...options.map((option) => option.flag.length), 0);
  for (const option of options) {
    lines.push(`  ${option.flag.padEnd(width)}   ${option.description}`);
  }
}
