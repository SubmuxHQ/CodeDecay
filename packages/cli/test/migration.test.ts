import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("codedecay migration CLI", () => {
  it("writes a plan-only deployment matrix for a real child repository", async () => {
    const root = createRepo();
    mkdirSync(join(root, "prisma", "migrations", "001_email"), { recursive: true });
    writeFileSync(join(root, "prisma", "migrations", "001_email", "migration.sql"), 'ALTER TABLE "User" ADD COLUMN "email" text NOT NULL;', "utf8");
    const result = await run(["migration", "--cwd", root, "--file", "prisma/migrations/001_email/migration.sql", "--target-kind", "disposable-local", "--format", "json", "--output", "reports/migration.json"]);
    const report = JSON.parse(readFileSync(join(root, "reports", "migration.json"), "utf8")) as { blockers: string[]; matrix: Array<{ state: string; status: string }>; safety: Record<string, boolean> };
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(report.blockers[0]).toContain("NOT NULL without a default");
    expect(report.matrix).toHaveLength(5);
    expect(report.safety).toMatchObject({ databaseConnected: false, migrationApplied: false, secretsRead: false });
  });

  it("makes an unspecified target and absent migration visible in Markdown", async () => {
    const result = await run(["migration", "--cwd", createRepo()]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Target: `unspecified`");
    expect(result.stdout).toContain("No migration SQL file was supplied");
    expect(result.stdout).toContain("No database was contacted");
  });
});

async function run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = ""; let stderr = "";
  const exitCode = await runCli(args, { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { exitCode, stdout, stderr };
}
function createRepo(): string {
  const root = join(tmpdir(), `codedecay-migration-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true }); execFileSync("git", ["init", "-q"], { cwd: root }); roots.push(root); return root;
}
