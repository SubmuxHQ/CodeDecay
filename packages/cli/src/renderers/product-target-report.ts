import type { ExecutionStatus } from "@submuxhq/codedecay-execution";
import type { ConfigFormat, ProductGeneratedTestFailure, ProductStartResult, ProductTargetReport, ProductTargetStatus } from "../types";
import { appendCodeBlock, appendOutputBlock } from "./command-output";

export function renderProductTargetReport(report: ProductTargetReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderProductTargetMarkdown(report);
}

function renderProductTargetMarkdown(report: ProductTargetReport): string {
  const lines = [
    "## CodeDecay Product Target Report",
    "",
    `**Overall status:** ${formatProductStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Ready | ${report.summary.ready} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Blocked | ${report.summary.blocked} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.targets.length === 0) {
    lines.push("No product testing targets configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Targets", "");
  for (const target of report.targets) {
    lines.push(`- **${target.id}** ${formatProductStatus(target.status)} in ${target.durationMs}ms`);
    lines.push(`  - Readiness: ${target.readiness.status} (${target.readiness.mode})`);
    lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
    lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);

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

    if (target.generatedTests) {
      lines.push(`  - Generated tests: ${formatProductStatus(target.generatedTests.status)} (${target.generatedTests.tests.length} test(s))`);
      if (target.generatedTests.sourcePath) {
        lines.push(`  - Generated test source: \`${target.generatedTests.sourcePath}\``);
      }
      if (target.generatedTests.manifestPath) {
        lines.push(`  - Generated test manifest: \`${target.generatedTests.manifestPath}\``);
      }
      if (target.generatedTests.error) {
        lines.push(`  - Generated test error: ${target.generatedTests.error}`);
      }
      for (const generatedTest of target.generatedTests.tests.slice(0, 8)) {
        lines.push(`  - Test: ${generatedTest.priority} ${generatedTest.kind} \`${generatedTest.id}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedTests.notes) {
        lines.push(`  - Generated test note: ${note}`);
      }
    }

    if (target.generatedTestRun) {
      lines.push(`  - Generated test run: ${formatProductStatus(target.generatedTestRun.status)}`);
      if (target.generatedTestRun.command) {
        lines.push(`  - Generated test command: \`${target.generatedTestRun.command}\``);
      }
      lines.push(`  - Generated test results: ${target.generatedTestRun.passed} passed, ${target.generatedTestRun.failed} failed, ${target.generatedTestRun.skipped} skipped`);
      if (target.generatedTestRun.error) {
        lines.push(`  - Generated test run error: ${target.generatedTestRun.error}`);
      }
      for (const failure of target.generatedTestRun.failures) {
        lines.push(`  - Failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        appendGeneratedFailureMetadata(lines, failure);
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedTestRun.notes) {
        lines.push(`  - Generated test run note: ${note}`);
      }
    }

    if (target.generatedApiTests) {
      lines.push(`  - Generated API tests: ${formatProductStatus(target.generatedApiTests.status)} (${target.generatedApiTests.tests.length} test(s))`);
      if (target.generatedApiTests.sourcePath) {
        lines.push(`  - Generated API test source: \`${target.generatedApiTests.sourcePath}\``);
      }
      if (target.generatedApiTests.manifestPath) {
        lines.push(`  - Generated API test manifest: \`${target.generatedApiTests.manifestPath}\``);
      }
      if (target.generatedApiTests.error) {
        lines.push(`  - Generated API test error: ${target.generatedApiTests.error}`);
      }
      for (const generatedTest of target.generatedApiTests.tests.slice(0, 8)) {
        const method = generatedTest.method ? `${generatedTest.method} ` : "";
        lines.push(`  - API test: ${generatedTest.priority} ${method}\`${generatedTest.operationPath ?? generatedTest.pageUrl}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedApiTests.notes) {
        lines.push(`  - Generated API test note: ${note}`);
      }
    }

    if (target.generatedApiTestRun) {
      lines.push(`  - Generated API test run: ${formatProductStatus(target.generatedApiTestRun.status)}`);
      if (target.generatedApiTestRun.command) {
        lines.push(`  - Generated API test command: \`${target.generatedApiTestRun.command}\``);
      }
      lines.push(`  - Generated API test results: ${target.generatedApiTestRun.passed} passed, ${target.generatedApiTestRun.failed} failed, ${target.generatedApiTestRun.skipped} skipped`);
      if (target.generatedApiTestRun.error) {
        lines.push(`  - Generated API test run error: ${target.generatedApiTestRun.error}`);
      }
      for (const failure of target.generatedApiTestRun.failures) {
        lines.push(`  - API failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        appendGeneratedFailureMetadata(lines, failure);
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedApiTestRun.notes) {
        lines.push(`  - Generated API test run note: ${note}`);
      }
    }

    if (target.teardown) {
      lines.push(`  - Teardown: ${formatCommandExecutionStatus(target.teardown.status)} \`${target.teardown.command}\``);
      appendOutputBlock(lines, "teardown stdout", target.teardown.stdout);
      appendOutputBlock(lines, "teardown stderr", target.teardown.stderr);
    }

    for (const note of target.notes) {
      lines.push(`  - Note: ${note}`);
    }
  }

  lines.push(
    "",
    "### Safety",
    "",
    `- Commands executed: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- Browser automation ran: ${report.safety.browserAutomationRan ? "yes" : "no"}`,
    `- Generated tests ran: ${report.safety.generatedTestsRan ? "yes" : "no"}`,
    `- Startup commands allowed: ${report.safety.startupCommandsAllowed ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    ""
  );

  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function appendGeneratedFailureMetadata(lines: string[], failure: ProductGeneratedTestFailure): void {
  if (failure.retryEvidence) {
    lines.push(
      `  - Repeat evidence: ${failure.retryEvidence.conclusion} (${failure.retryEvidence.passed} passed, ${failure.retryEvidence.failed} failed across ${failure.retryEvidence.attempts} attempt(s))`
    );
    if (failure.retryEvidence.error) {
      lines.push(`  - Repeat evidence error: ${failure.retryEvidence.error}`);
    }
  }

  if (failure.classification) {
    const confidence = failure.classificationConfidence !== undefined ? ` (${Math.round(failure.classificationConfidence * 100)}% confidence)` : "";
    lines.push(`  - Classification: ${failure.classification}${confidence}`);
  }

  for (const evidence of failure.classificationEvidence ?? []) {
    lines.push(`  - Classification evidence: ${evidence}`);
  }

  for (const task of failure.suggestedFixTasks ?? []) {
    lines.push(`  - Repair task: ${task}`);
  }
}

export function formatProductStatus(status: ProductTargetStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatCommandExecutionStatus(status: ExecutionStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatProductStartStatus(status: ProductStartResult["status"]): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

