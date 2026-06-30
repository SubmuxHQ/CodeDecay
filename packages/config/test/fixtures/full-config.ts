import type { CodeDecayConfig } from "../../src/index";

export const FULL_CONFIG_YAML = [
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
  "memoryProviders:",
  "  providers:",
  "    - provider: local",
  "      enabled: true",
  "    - provider: mem0",
  "      endpoint: http://127.0.0.1:8000",
  "      apiKeyEnv: MEM0_API_KEY",
  "      projectId: codedecay",
  "    - provider: supermemory",
  "      enabled: false",
  "      endpoint: http://127.0.0.1:3001",
  "      apiKeyEnv: SUPERMEMORY_API_KEY",
  "      collection: codedecay",
  "plugins:",
  "  enabled:",
  "    - local-security-pack",
  "    - team-ownership-pack",
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
].join("\n");

export const EXPECTED_FULL_CONFIG: CodeDecayConfig = {
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
  memoryProviders: {
    providers: [
      {
        provider: "local",
        enabled: true
      },
      {
        provider: "mem0",
        enabled: true,
        endpoint: "http://127.0.0.1:8000",
        apiKeyEnv: "MEM0_API_KEY",
        projectId: "codedecay"
      },
      {
        provider: "supermemory",
        enabled: false,
        endpoint: "http://127.0.0.1:3001",
        apiKeyEnv: "SUPERMEMORY_API_KEY",
        collection: "codedecay"
      }
    ]
  },
  plugins: {
    enabled: ["local-security-pack", "team-ownership-pack"]
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
};
