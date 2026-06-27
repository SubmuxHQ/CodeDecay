import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  createConfiguredToolHarnesses,
  createPactHarness,
  createPlaywrightHarness,
  createSchemathesisHarness,
  createStrykerHarness
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("createPlaywrightHarness", () => {
  it("plans a Playwright browser-flow check", async () => {
    const harness = createPlaywrightHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("playwright");
    expect(harness.capabilities).toEqual(["browser-flow", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "playwright",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm exec playwright test");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createPlaywrightHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "browser-flow",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createPlaywrightHarness({
      command: "node playwright-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "playwright-pass.js", "console.log('playwright ok');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("Playwright checks passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "playwright ok"
    });
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createPlaywrightHarness({
      command: "node playwright-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "playwright-fail.js", "console.error('playwright failed'); process.exit(7);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node playwright-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 7,
      stderr: "playwright failed"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createPlaywrightHarness({
      command: "rm -rf ./tmp",
      allowCommands: true,
      timeoutMs: 1000
    });

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("unsafe-command");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "rm -rf ./tmp"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "blocked",
      blockedReason: "recursive or forced file deletion"
    });
  });
});

describe("createStrykerHarness", () => {
  it("plans a StrykerJS mutation check", async () => {
    const harness = createStrykerHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("stryker");
    expect(harness.capabilities).toEqual(["mutation-testing", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "stryker",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm exec stryker run");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createStrykerHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "mutation",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "node stryker-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "stryker-pass.js", "console.log('mutation score 100');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("StrykerJS mutation checks passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "mutation score 100"
    });
  });

  it("surfaces surviving and no-coverage mutants from Stryker JSON reports", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "node stryker-pass.js",
      reportPath: "reports/mutation/mutation.json",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "stryker-pass.js", "console.log('mutation report written');\n");
    writeFile(
      repo,
      "reports/mutation/mutation.json",
      JSON.stringify(
        {
          thresholds: {
            mutationScore: 72.5
          },
          files: {
            "src/math.ts": {
              mutants: [
                {
                  id: "1",
                  status: "Survived",
                  mutatorName: "ArithmeticOperator",
                  replacement: "a - b",
                  location: { start: { line: 3, column: 10 }, end: { line: 3, column: 15 } }
                },
                {
                  id: "2",
                  status: "NoCoverage",
                  mutatorName: "ConditionalExpression",
                  location: { start: { line: 8, column: 2 }, end: { line: 8, column: 20 } }
                },
                {
                  id: "3",
                  status: "Killed",
                  mutatorName: "StringLiteral"
                }
              ]
            }
          }
        },
        null,
        2
      )
    );

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("no-evidence");
    expect(result.summary).toContain("StrykerJS found 2 surviving or no-coverage mutant");
    expect(result.artifacts).toEqual([
      {
        path: "reports/mutation/mutation.json",
        description: "StrykerJS mutation testing report."
      }
    ]);
    expect(result.evidence[1]).toMatchObject({
      kind: "mutation",
      severity: "high",
      artifactPath: "reports/mutation/mutation.json",
      metadata: {
        totalMutants: 3,
        survivedMutants: 1,
        noCoverageMutants: 1,
        mutationScore: 72.5
      }
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/math.ts",
          line: 3,
          summary: "Survived ArithmeticOperator mutant in src/math.ts:3."
        }),
        expect.objectContaining({
          file: "src/math.ts",
          line: 8,
          summary: "NoCoverage ConditionalExpression mutant in src/math.ts:8."
        })
      ])
    );
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "node stryker-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "stryker-fail.js", "console.error('mutation score too low'); process.exit(9);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node stryker-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 9,
      stderr: "mutation score too low"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "rm -rf ./tmp",
      allowCommands: true,
      timeoutMs: 1000
    });

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("unsafe-command");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "rm -rf ./tmp"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "blocked",
      blockedReason: "recursive or forced file deletion"
    });
  });

  it("validates configured options", () => {
    expect(() => createStrykerHarness({ command: "" })).toThrow("StrykerJS command is required.");
    expect(() => createStrykerHarness({ reportPath: "" })).toThrow("StrykerJS reportPath is required.");
    expect(() => createStrykerHarness({ timeoutMs: 0 })).toThrow("StrykerJS timeoutMs must be a positive integer.");
  });
});

describe("createSchemathesisHarness", () => {
  it("plans a Schemathesis API fuzzing check", async () => {
    const harness = createSchemathesisHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("schemathesis");
    expect(harness.capabilities).toEqual(["api-fuzzing", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "schemathesis",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("st run openapi.yaml --url http://127.0.0.1:3000");
  });

  it("builds the default command from configured schema and baseUrl", async () => {
    const harness = createSchemathesisHarness({
      schema: "docs/openapi.yaml",
      baseUrl: "http://127.0.0.1:8080"
    });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });

    expect(plan.steps[0]?.description).toContain("st run docs/openapi.yaml --url http://127.0.0.1:8080");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createSchemathesisHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "api-fuzz",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createSchemathesisHarness({
      command: "node schemathesis-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "schemathesis-pass.js", "console.log('api fuzzing ok');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("Schemathesis API fuzzing passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "api fuzzing ok"
    });
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createSchemathesisHarness({
      command: "node schemathesis-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "schemathesis-fail.js", "console.error('server error found'); process.exit(12);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node schemathesis-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 12,
      stderr: "server error found"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createSchemathesisHarness({
      command: "rm -rf ./tmp",
      allowCommands: true,
      timeoutMs: 1000
    });

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("unsafe-command");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "rm -rf ./tmp"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "blocked",
      blockedReason: "recursive or forced file deletion"
    });
  });

  it("validates configured options", () => {
    expect(() => createSchemathesisHarness({ command: "" })).toThrow("Schemathesis command is required.");
    expect(() => createSchemathesisHarness({ schema: " " })).toThrow("Schemathesis schema is required.");
    expect(() => createSchemathesisHarness({ timeoutMs: 0 })).toThrow(
      "Schemathesis timeoutMs must be a positive integer."
    );
  });
});

describe("createPactHarness", () => {
  it("plans a Pact contract testing check", async () => {
    const harness = createPactHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("pact");
    expect(harness.capabilities).toEqual(["contract-testing", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "pact",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm run test:pact");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createPactHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "contract",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createPactHarness({
      command: "node pact-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "pact-pass.js", "console.log('contracts verified');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("Pact contract tests passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "contracts verified"
    });
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createPactHarness({
      command: "node pact-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "pact-fail.js", "console.error('contract mismatch'); process.exit(14);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node pact-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 14,
      stderr: "contract mismatch"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createPactHarness({
      command: "rm -rf ./tmp",
      allowCommands: true,
      timeoutMs: 1000
    });

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("unsafe-command");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "rm -rf ./tmp"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "blocked",
      blockedReason: "recursive or forced file deletion"
    });
  });

  it("validates configured options", () => {
    expect(() => createPactHarness({ command: "" })).toThrow("Pact command is required.");
    expect(() => createPactHarness({ timeoutMs: 0 })).toThrow("Pact timeoutMs must be a positive integer.");
    expect(() => createPactHarness({ outputLimit: 0 })).toThrow("Pact outputLimit must be a positive integer.");
  });
});

describe("createConfiguredToolHarnesses", () => {
  it("creates enabled harnesses from CodeDecay config", async () => {
    const config = createConfig();
    config.safety.allowCommands = false;
    config.toolAdapters = {
      playwright: {
        enabled: true
      },
      stryker: {
        enabled: true,
        command: "pnpm exec stryker run --mutate src/**/*.ts",
        timeoutMs: 300000,
        reportPath: "tmp/stryker.json"
      },
      schemathesis: {
        enabled: true,
        schema: "docs/openapi.yaml",
        baseUrl: "http://127.0.0.1:4000"
      },
      pact: {
        enabled: false
      }
    };

    const configured = createConfiguredToolHarnesses(config);

    expect(configured.map((item) => [item.kind, item.name, item.command, item.timeoutMs])).toEqual([
      ["playwright", "Playwright", "pnpm exec playwright test", undefined],
      ["stryker", "StrykerJS", "pnpm exec stryker run --mutate src/**/*.ts", 300000],
      ["schemathesis", "Schemathesis", "st run docs/openapi.yaml --url http://127.0.0.1:4000", undefined]
    ]);

    const plan = await configured[0]?.harness.plan({ cwd: createTempDir(), evidence: [] });
    expect(plan?.requiresApproval).toBe(true);
  });

  it("marks harness plans approved when configured commands are allowed", async () => {
    const config = createConfig();
    config.safety.allowCommands = true;
    config.toolAdapters = {
      pact: {
        enabled: true,
        command: "pnpm run pact:verify"
      }
    };

    const [configured] = createConfiguredToolHarnesses(config);

    expect(configured?.kind).toBe("pact");
    expect(configured?.command).toBe("pnpm run pact:verify");
    const plan = await configured?.harness.plan({ cwd: createTempDir(), evidence: [] });
    expect(plan?.requiresApproval).toBe(false);
  });
});

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-tool-adapters-${process.pid}-${tempRoots.length}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function createConfig(): CodeDecayConfig {
  return {
    version: 1,
    commands: {
      test: [],
      build: [],
      start: []
    },
    probes: [],
    safety: {
      commandTimeoutMs: 120000,
      allowCommands: false
    },
    llm: {
      provider: "disabled",
      timeoutMs: 30000
    },
    toolAdapters: {},
    productTesting: {
      targets: {}
    }
  };
}
