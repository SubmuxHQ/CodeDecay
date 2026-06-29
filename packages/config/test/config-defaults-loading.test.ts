import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";
import { createTempDir, writeFile } from "./helpers/config";

describe("CodeDecay config defaults and loading", () => {
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
});
