import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

export function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-tool-adapters-${process.pid}-${tempRoots.length}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

export function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

export function createSemgrepReport(severity: "ERROR" | "WARNING" | "INFO"): Record<string, unknown> {
  return {
    results: [
      {
        check_id: "javascript.express.security.audit.xss",
        path: "src/app.ts",
        start: { line: 12, col: 3 },
        end: { line: 12, col: 21 },
        extra: {
          message: "User input reaches response",
          severity,
          fingerprint: "abc123",
          metadata: {
            category: "security",
            confidence: "HIGH",
            technology: ["express"]
          }
        }
      }
    ]
  };
}

export function createConfig(): CodeDecayConfig {
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
