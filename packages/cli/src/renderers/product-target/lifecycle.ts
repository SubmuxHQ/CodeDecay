import type { ProductTargetResult } from "../../types";
import { appendOutputBlock } from "../command-output";
import { formatCommandExecutionStatus, formatProductStartStatus, formatProductStatus } from "./format";

export function appendTargetRuntimeSections(lines: string[], target: ProductTargetResult): void {
  if (target.setup) {
    lines.push(`  - Setup: ${formatCommandExecutionStatus(target.setup.status)} \`${target.setup.command}\``);
    appendOutputBlock(lines, "setup stdout", target.setup.stdout);
    appendOutputBlock(lines, "setup stderr", target.setup.stderr);
  }

  if (target.start) {
    lines.push(`  - Start: ${formatProductStartStatus(target.start.status)} \`${target.start.command}\``);
    if (target.start.error) {
      lines.push(`  - Start error: ${target.start.error}`);
    }
    appendOutputBlock(lines, "start stdout", target.start.stdout);
    appendOutputBlock(lines, "start stderr", target.start.stderr);
  }

  if (target.health) {
    lines.push(
      `  - Health: ${formatProductStatus(target.health.status)} after ${target.health.attempts} attempt(s) at \`${target.health.url}\``
    );
    if (target.health.httpStatus !== undefined) {
      lines.push(`  - HTTP status: ${target.health.httpStatus}`);
    }
    if (target.health.error) {
      lines.push(`  - Health error: ${target.health.error}`);
    }
  }

  if (target.exploration) {
    lines.push(`  - Exploration: ${formatProductStatus(target.exploration.status)} using ${target.exploration.driver}`);
    lines.push(`  - Flow pages: ${target.exploration.pages}`);
    lines.push(`  - Interactive elements: ${target.exploration.interactiveElements}`);
    lines.push(`  - Blocked actions: ${target.exploration.blockedActions}`);
    lines.push(`  - Skipped actions: ${target.exploration.skippedActions}`);
    if (target.exploration.artifactPath) {
      lines.push(`  - Flow map: \`${target.exploration.artifactPath}\``);
    }
    if (target.exploration.error) {
      lines.push(`  - Exploration error: ${target.exploration.error}`);
    }
    for (const note of target.exploration.notes) {
      lines.push(`  - Exploration note: ${note}`);
    }
  }
}

export function appendTargetTeardownAndNotes(lines: string[], target: ProductTargetResult): void {
  if (target.teardown) {
    lines.push(`  - Teardown: ${formatCommandExecutionStatus(target.teardown.status)} \`${target.teardown.command}\``);
    appendOutputBlock(lines, "teardown stdout", target.teardown.stdout);
    appendOutputBlock(lines, "teardown stderr", target.teardown.stderr);
  }

  for (const note of target.notes) {
    lines.push(`  - Note: ${note}`);
  }
}
