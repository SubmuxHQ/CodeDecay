import type { ProductGeneratedTestFailure, ProductGeneratedTestRunResult, ProductGeneratedTestsResult } from "../../types";
import { appendCodeBlock } from "../command-output";
import { formatProductStatus } from "./format";

export function appendGeneratedTestsSection(lines: string[], generatedTests: ProductGeneratedTestsResult): void {
  lines.push(`  - Generated tests: ${formatProductStatus(generatedTests.status)} (${generatedTests.tests.length} test(s))`);
  if (generatedTests.sourcePath) {
    lines.push(`  - Generated test source: \`${generatedTests.sourcePath}\``);
  }
  if (generatedTests.manifestPath) {
    lines.push(`  - Generated test manifest: \`${generatedTests.manifestPath}\``);
  }
  if (generatedTests.error) {
    lines.push(`  - Generated test error: ${generatedTests.error}`);
  }
  for (const generatedTest of generatedTests.tests.slice(0, 8)) {
    lines.push(`  - Test: ${generatedTest.priority} ${generatedTest.kind} \`${generatedTest.id}\` ${generatedTest.title}`);
  }
  for (const note of generatedTests.notes) {
    lines.push(`  - Generated test note: ${note}`);
  }
}

export function appendGeneratedTestRunSection(lines: string[], generatedTestRun: ProductGeneratedTestRunResult): void {
  lines.push(`  - Generated test run: ${formatProductStatus(generatedTestRun.status)}`);
  if (generatedTestRun.command) {
    lines.push(`  - Generated test command: \`${generatedTestRun.command}\``);
  }
  lines.push(`  - Generated test results: ${generatedTestRun.passed} passed, ${generatedTestRun.failed} failed, ${generatedTestRun.skipped} skipped`);
  if (generatedTestRun.error) {
    lines.push(`  - Generated test run error: ${generatedTestRun.error}`);
  }
  for (const failure of generatedTestRun.failures) {
    appendGeneratedFailure(lines, failure, "Failure");
  }
  for (const note of generatedTestRun.notes) {
    lines.push(`  - Generated test run note: ${note}`);
  }
}

export function appendGeneratedApiTestsSection(lines: string[], generatedApiTests: ProductGeneratedTestsResult): void {
  lines.push(`  - Generated API tests: ${formatProductStatus(generatedApiTests.status)} (${generatedApiTests.tests.length} test(s))`);
  if (generatedApiTests.sourcePath) {
    lines.push(`  - Generated API test source: \`${generatedApiTests.sourcePath}\``);
  }
  if (generatedApiTests.manifestPath) {
    lines.push(`  - Generated API test manifest: \`${generatedApiTests.manifestPath}\``);
  }
  if (generatedApiTests.error) {
    lines.push(`  - Generated API test error: ${generatedApiTests.error}`);
  }
  for (const generatedTest of generatedApiTests.tests.slice(0, 8)) {
    const method = generatedTest.method ? `${generatedTest.method} ` : "";
    lines.push(`  - API test: ${generatedTest.priority} ${method}\`${generatedTest.operationPath ?? generatedTest.pageUrl}\` ${generatedTest.title}`);
  }
  for (const note of generatedApiTests.notes) {
    lines.push(`  - Generated API test note: ${note}`);
  }
}

export function appendGeneratedApiTestRunSection(lines: string[], generatedApiTestRun: ProductGeneratedTestRunResult): void {
  lines.push(`  - Generated API test run: ${formatProductStatus(generatedApiTestRun.status)}`);
  if (generatedApiTestRun.command) {
    lines.push(`  - Generated API test command: \`${generatedApiTestRun.command}\``);
  }
  lines.push(`  - Generated API test results: ${generatedApiTestRun.passed} passed, ${generatedApiTestRun.failed} failed, ${generatedApiTestRun.skipped} skipped`);
  if (generatedApiTestRun.error) {
    lines.push(`  - Generated API test run error: ${generatedApiTestRun.error}`);
  }
  for (const failure of generatedApiTestRun.failures) {
    appendGeneratedFailure(lines, failure, "API failure");
  }
  for (const note of generatedApiTestRun.notes) {
    lines.push(`  - Generated API test run note: ${note}`);
  }
}

function appendGeneratedFailure(lines: string[], failure: ProductGeneratedTestFailure, label: "Failure" | "API failure"): void {
  lines.push(`  - ${label}: ${failure.title}`);
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
