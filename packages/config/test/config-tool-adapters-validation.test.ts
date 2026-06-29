import { describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";
import { createTempDir, writeFile } from "./helpers/config";

describe("CodeDecay tool adapter config validation", () => {
  it("fails clearly for invalid tool adapter config", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  playwright:\n    command: ''\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/toolAdapters.playwright.command must be a non-empty string/);
  });

  it("fails clearly for invalid tool adapter timeouts", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  pact:\n    timeoutMs: 0\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/toolAdapters.pact.timeoutMs must be a positive integer/);
  });

  it("fails clearly for invalid Stryker report paths", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  stryker:\n    reportPath: ''\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/toolAdapters.stryker.reportPath must be a non-empty string/);
  });

  it("fails clearly for invalid Semgrep adapter fields", () => {
    const emptyConfigRoot = createTempDir();
    writeFile(emptyConfigRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  semgrep:\n    config: ''\n");
    expect(() => loadCodeDecayConfig({ cwd: emptyConfigRoot })).toThrow(/toolAdapters.semgrep.config must be a non-empty string/);

    const invalidSeverityRoot = createTempDir();
    writeFile(invalidSeverityRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  semgrep:\n    failOnSeverity: critical\n");
    expect(() => loadCodeDecayConfig({ cwd: invalidSeverityRoot })).toThrow(/toolAdapters.semgrep.failOnSeverity must be low, medium, or high/);
  });

  it("fails clearly for invalid agent process adapter fields", () => {
    const invalidProfileRoot = createTempDir();
    writeFile(invalidProfileRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  agentProcess:\n    profile: robot\n");
    expect(() => loadCodeDecayConfig({ cwd: invalidProfileRoot })).toThrow(
      /toolAdapters.agentProcess.profile must be generic, codex, claude-code, cursor, pi, opencode, or desktop/
    );

    const invalidFormatRoot = createTempDir();
    writeFile(invalidFormatRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  agentProcess:\n    bundleFormat: xml\n");
    expect(() => loadCodeDecayConfig({ cwd: invalidFormatRoot })).toThrow(
      /toolAdapters.agentProcess.bundleFormat must be markdown or json/
    );
  });

  it("fails clearly for invalid coverage adapter fields", () => {
    const emptyPathRoot = createTempDir();
    writeFile(emptyPathRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  coverage:\n    reportPaths:\n      - ''\n");
    expect(() => loadCodeDecayConfig({ cwd: emptyPathRoot })).toThrow(
      /toolAdapters.coverage.reportPaths\[0\] must be a non-empty string/
    );

    const invalidFailOnRoot = createTempDir();
    writeFile(invalidFailOnRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  coverage:\n    failOn: partial\n");
    expect(() => loadCodeDecayConfig({ cwd: invalidFailOnRoot })).toThrow(/toolAdapters.coverage.failOn must be none or uncovered/);
  });
});
