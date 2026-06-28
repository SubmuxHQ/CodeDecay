import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadCodeDecayConfig", () => {
  it("returns safe defaults when config is missing", () => {
    const root = createTempDir();
    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBeUndefined();
    expect(loaded.config).toEqual({
      version: 1,
      commands: {
        test: [],
        build: [],
        start: []
      },
      probes: [],
      safety: {
        commandTimeoutMs: 120_000,
        allowCommands: false
      },
      llm: {
        provider: "disabled",
        timeoutMs: 30_000
      },
      toolAdapters: {},
      productTesting: {
        targets: {}
      }
    });
  });

  it("returns fresh default config objects for missing config", () => {
    const root = createTempDir();
    const first = loadCodeDecayConfig({ cwd: root });
    first.config.commands.test.push("mutated test command");

    const second = loadCodeDecayConfig({ cwd: root });

    expect(second.config.commands.test).toEqual([]);
  });

  it("loads .codedecay/config.yml from cwd", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - pnpm test",
        "  build: pnpm build",
        "  start: pnpm dev",
        "probes:",
        "  - name: users api",
        "    command: curl -f http://localhost:3000/api/users",
        "    timeoutMs: 5000",
        "safety:",
        "  commandTimeoutMs: 30000",
        "  allowCommands: true",
        "llm:",
        "  provider: ollama",
        "  model: qwen2.5-coder",
        "  endpoint: http://127.0.0.1:11434",
        "  timeoutMs: 20000",
        "toolAdapters:",
        "  agentProcess:",
        "    command: node agent-harness.js",
        "    profile: codex",
        "    bundleFormat: json",
        "    timeoutMs: 240000",
        "  playwright: true",
        "  stryker:",
        "    command: pnpm exec stryker run",
        "    timeoutMs: 300000",
        "    reportPath: reports/mutation/mutation.json",
        "  schemathesis:",
        "    schema: docs/openapi.yaml",
        "    baseUrl: http://127.0.0.1:4000",
        "  pact:",
        "    enabled: false",
        "  semgrep:",
        "    config: .semgrep.yml",
        "    reportPath: reports/semgrep.json",
        "    failOnSeverity: medium",
        "    timeoutMs: 180000",
        "  coverage:",
        "    command: pnpm test -- --coverage",
        "    reportPaths:",
        "      - coverage/coverage-final.json",
        "      - coverage/lcov.info",
        "    failOn: uncovered",
        "    timeoutMs: 120000",
        "productTesting:",
        "  targets:",
        "    web:",
        "      baseUrl: http://127.0.0.1:3000",
        "      startCommand: pnpm dev",
        "      healthCheck: http://127.0.0.1:3000/api/health",
        "      authSetupCommand: pnpm test:auth-seed",
        "      teardownCommand: pnpm stop",
        "      previewUrlEnv: VERCEL_URL",
        "      apiEndpoints:",
        "        - id: list-users",
        "          method: get",
        "          path: /api/users",
        "          expectedStatuses: [200, 401]",
        "          headers:",
        "            x-test-suite: codedecay",
        "        - method: POST",
        "          path: /api/users",
        "          expectedStatuses: [201, 400]",
        "          body:",
        "            email: codedecay@example.com",
        "      timeoutMs: 60000",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, ".codedecay/config.yml"));
    expect(loaded.config).toEqual({
      version: 1,
      commands: {
        test: ["pnpm test"],
        build: ["pnpm build"],
        start: ["pnpm dev"]
      },
      probes: [
        {
          name: "users api",
          command: "curl -f http://localhost:3000/api/users",
          timeoutMs: 5000
        }
      ],
      safety: {
        commandTimeoutMs: 30000,
        allowCommands: true
      },
      llm: {
        provider: "ollama",
        model: "qwen2.5-coder",
        endpoint: "http://127.0.0.1:11434",
        timeoutMs: 20000
      },
      toolAdapters: {
        agentProcess: {
          enabled: true,
          command: "node agent-harness.js",
          profile: "codex",
          bundleFormat: "json",
          timeoutMs: 240000
        },
        playwright: {
          enabled: true
        },
        stryker: {
          enabled: true,
          command: "pnpm exec stryker run",
          timeoutMs: 300000,
          reportPath: "reports/mutation/mutation.json"
        },
        schemathesis: {
          enabled: true,
          schema: "docs/openapi.yaml",
          baseUrl: "http://127.0.0.1:4000"
        },
        pact: {
          enabled: false
        },
        semgrep: {
          enabled: true,
          config: ".semgrep.yml",
          reportPath: "reports/semgrep.json",
          failOnSeverity: "medium",
          timeoutMs: 180000
        },
        coverage: {
          enabled: true,
          command: "pnpm test -- --coverage",
          reportPaths: ["coverage/coverage-final.json", "coverage/lcov.info"],
          failOn: "uncovered",
          timeoutMs: 120000
        }
      },
      productTesting: {
        targets: {
          web: {
            id: "web",
            baseUrl: "http://127.0.0.1:3000",
            startCommand: "pnpm dev",
            healthCheck: "http://127.0.0.1:3000/api/health",
            authSetupCommand: "pnpm test:auth-seed",
            teardownCommand: "pnpm stop",
            previewUrlEnv: "VERCEL_URL",
            apiEndpoints: [
              {
                id: "list-users",
                method: "GET",
                path: "/api/users",
                expectedStatuses: [200, 401],
                headers: {
                  "x-test-suite": "codedecay"
                }
              },
              {
                method: "POST",
                path: "/api/users",
                expectedStatuses: [201, 400],
                body: {
                  email: "codedecay@example.com"
                }
              }
            ],
            timeoutMs: 60000,
            readiness: {
              status: "ready",
              mode: "base-url",
              effectiveBaseUrl: "http://127.0.0.1:3000",
              commandsRequired: ["pnpm test:auth-seed", "pnpm dev", "pnpm stop"],
              commandsAllowed: true,
              willRunCommands: false,
              notes: [
                "Config loading never executes product target commands.",
                "Target can use an already-running app at baseUrl."
              ]
            }
          }
        }
      }
    });
  });

  it("resolves preview product target URLs from environment without running commands", () => {
    const root = createTempDir();
    const marker = join(root, "should-not-exist");
    const previousPreviewUrl = process.env.CODEDECAY_TEST_PREVIEW_URL;
    process.env.CODEDECAY_TEST_PREVIEW_URL = "https://preview.example.test";
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    preview:",
        "      previewUrlEnv: CODEDECAY_TEST_PREVIEW_URL",
        `      startCommand: node -e \"require('fs').writeFileSync('${marker}', 'ran')\"`,
        "      healthCheck: https://preview.example.test/health",
        ""
      ].join("\n")
    );

    try {
      const loaded = loadCodeDecayConfig({ cwd: root });

      expect(existsSync(marker)).toBe(false);
      expect(loaded.config.productTesting.targets.preview).toMatchObject({
        id: "preview",
        previewUrlEnv: "CODEDECAY_TEST_PREVIEW_URL",
        healthCheck: "https://preview.example.test/health",
        timeoutMs: 60000,
        readiness: {
          status: "ready",
          mode: "preview-url-env",
          effectiveBaseUrl: "https://preview.example.test",
          commandsAllowed: false,
          willRunCommands: false
        }
      });
    } finally {
      if (previousPreviewUrl === undefined) {
        delete process.env.CODEDECAY_TEST_PREVIEW_URL;
      } else {
        process.env.CODEDECAY_TEST_PREVIEW_URL = previousPreviewUrl;
      }
    }
  });

  it("marks start-command product targets as needing command approval when commands are disallowed", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    local:",
        "      startCommand: pnpm dev",
        "      healthCheck: http://127.0.0.1:3000/health",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.productTesting.targets.local?.readiness).toMatchObject({
      status: "needs-command-approval",
      mode: "start-command",
      commandsRequired: ["pnpm dev"],
      commandsAllowed: false,
      willRunCommands: false
    });
  });

  it("discovers codedecay.config.yml from cwd", () => {
    const root = createTempDir();
    writeFile(root, "codedecay.config.yml", "version: 1\ncommands:\n  test: npm test\n");

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, "codedecay.config.yml"));
    expect(loaded.config.commands.test).toEqual(["npm test"]);
  });

  it("discovers .codedecay/config.yaml from cwd", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yaml", "version: 1\ncommands:\n  build: npm run build\n");

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, ".codedecay/config.yaml"));
    expect(loaded.config.commands.build).toEqual(["npm run build"]);
  });

  it("loads LiteLLM BYOK provider config without storing literal keys", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: LITELLM_API_KEY",
        "  timeoutMs: 15000",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.llm).toEqual({
      provider: "litellm",
      model: "gpt-4.1-mini",
      endpoint: "http://127.0.0.1:4000/v1",
      apiKeyEnv: "LITELLM_API_KEY",
      timeoutMs: 15000
    });
  });

  it("fails clearly for invalid config", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 2\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/version must be 1/);
  });

  it("fails clearly for invalid llm provider", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nllm:\n  provider: hosted\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/llm.provider must be disabled, ollama, or litellm/);
  });

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
    expect(() => loadCodeDecayConfig({ cwd: emptyPathRoot })).toThrow(/toolAdapters.coverage.reportPaths\[0\] must be a non-empty string/);

    const invalidFailOnRoot = createTempDir();
    writeFile(invalidFailOnRoot, ".codedecay/config.yml", "version: 1\ntoolAdapters:\n  coverage:\n    failOn: partial\n");
    expect(() => loadCodeDecayConfig({ cwd: invalidFailOnRoot })).toThrow(/toolAdapters.coverage.failOn must be none or uncovered/);
  });

  it("fails clearly for invalid product target URLs", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nproductTesting:\n  targets:\n    web:\n      baseUrl: localhost:3000\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/productTesting.targets.web.baseUrl must be an http or https URL/);
  });
});

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-config-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}
