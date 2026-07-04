import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("local setup scripts", () => {
  it("does not hang when pnpm version probing blocks", () => {
    const fakeBin = createTempDir();
    writeExecutable(
      join(fakeBin, "pnpm"),
      ["#!/usr/bin/env bash", "sleep 30", ""].join("\n")
    );

    const startedAt = Date.now();
    const result = spawnSync("bash", [".codedecay/status.local.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`
      },
      timeout: 5_000
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(result.stdout).toContain("pnpm: unavailable (pnpm --version failed or timed out)");
  });

  it("keeps setup package-manager probes bounded and provides an npx fallback", () => {
    const setup = readFileSync(join(process.cwd(), ".codedecay/setup.local.sh"), "utf8");

    expect(setup).toContain("probe_package_manager_version 2 corepack pnpm --version");
    expect(setup).toContain("probe_package_manager_version 20 npx --yes pnpm@11.8.0 --version");
    expect(setup).toContain("PNPM_CMD=(npx --yes pnpm@11.8.0)");
    expect(setup).not.toContain("&& corepack pnpm --version");
  });
});

function createTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-local-setup-"));
  tempRoots.push(root);
  return root;
}

function writeExecutable(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  chmodSync(path, 0o755);
}
