import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
      toolAdapters: {}
    });
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
        "  playwright: true",
        "  stryker:",
        "    command: pnpm exec stryker run",
        "    timeoutMs: 300000",
        "  schemathesis:",
        "    schema: docs/openapi.yaml",
        "    baseUrl: http://127.0.0.1:4000",
        "  pact:",
        "    enabled: false",
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
        playwright: {
          enabled: true
        },
        stryker: {
          enabled: true,
          command: "pnpm exec stryker run",
          timeoutMs: 300000
        },
        schemathesis: {
          enabled: true,
          schema: "docs/openapi.yaml",
          baseUrl: "http://127.0.0.1:4000"
        },
        pact: {
          enabled: false
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

  it("fails clearly for invalid config", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 2\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/version must be 1/);
  });

  it("fails clearly for invalid llm provider", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nllm:\n  provider: hosted\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/llm.provider must be disabled or ollama/);
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
