import type { UninstallPlanView, UpdatePlanView } from "./types";

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
