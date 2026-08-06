import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeMigrationSafety, classifyMigrationConnectionTarget } from "../src/index";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT migration data safety (#686)", () => {
  it("UAT-DATA-1: additive nullable migration is plan-ready for mixed-version checks", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'ALTER TABLE "User" ADD COLUMN "nickname" text;');
    const report = analyzeMigrationSafety({
      rootDir: root,
      files: ["migration.sql"],
      targetKind: "disposable-local",
      cleanupPlan: "drop disposable volume codedecay-mig",
      generatedAt: "2026-08-06T00:00:00.000Z"
    });
    expect(report.operations[0]).toMatchObject({ kind: "add-column", risk: "info", requiresBackfill: false });
    expect(report.blockers).toEqual([]);
    expect(report.verdict).toBe("plan-ready");
    expect(report.fullyVerified).toBe(false);
    expect(report.matrix.find((item) => item.state === "old-app-new-schema")?.status).toBe("needs-proof");
  });

  it("UAT-DATA-2: non-null column without safe default/backfill is blocked", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'ALTER TABLE "User" ADD COLUMN "email" text NOT NULL;');
    const report = analyzeMigrationSafety({
      rootDir: root,
      files: ["migration.sql"],
      targetKind: "disposable-local",
      cleanupPlan: "drop disposable volume codedecay-mig"
    });
    expect(report.operations[0]).toMatchObject({ kind: "add-column", risk: "blocker", requiresBackfill: true });
    expect(report.verdict).toBe("plan-blocked");
    expect(report.matrix.find((item) => item.state === "old-app-new-schema")?.status).toBe("blocked");
  });

  it("UAT-DATA-3: renamed or removed field breaks old app during rolling deploy", () => {
    const root = tempRoot();
    write(
      root,
      "migration.sql",
      'ALTER TABLE "User" RENAME COLUMN "name" TO "full_name"; ALTER TABLE "User" DROP COLUMN "legacy";'
    );
    const report = analyzeMigrationSafety({
      rootDir: root,
      files: ["migration.sql"],
      targetKind: "disposable-local",
      cleanupPlan: "drop disposable volume codedecay-mig"
    });
    expect(report.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "rename-column", risk: "blocker" }),
        expect.objectContaining({ kind: "drop-column", risk: "blocker", destructive: true })
      ])
    );
    expect(report.matrix.find((item) => item.state === "old-app-new-schema")).toMatchObject({ status: "blocked" });
    expect(report.verdict).toBe("plan-blocked");
  });

  it("UAT-DATA-4: rollback failure remains visible and blocks full verification", () => {
    const root = tempRoot();
    write(root, "up.sql", 'ALTER TABLE "User" ADD COLUMN "nickname" text;');
    write(root, "down.sql", 'ALTER TABLE "User" DROP COLUMN "nickname";');
    const report = analyzeMigrationSafety({
      rootDir: root,
      files: ["up.sql"],
      rollbackFiles: ["down.sql"],
      targetKind: "disposable-local",
      cleanupPlan: "drop disposable volume codedecay-mig",
      rollbackFailed: true
    });
    expect(report.rollbackStatus).toBe("failed");
    expect(report.matrix.find((item) => item.state === "rollback")?.status).toBe("failed");
    expect(report.fullyVerified).toBe(false);
    expect(report.verdict).toBe("plan-blocked");
    expect(report.blockers.join(" ")).toMatch(/Rollback execution failed/i);
  });

  it("UAT-DATA-5: production-looking connection string is blocked without leaking secrets", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'CREATE TABLE "Audit" ("id" text PRIMARY KEY);');
    const report = analyzeMigrationSafety({
      rootDir: root,
      files: ["migration.sql"],
      connectionUrl: "postgres://app:s3cret-pass@db.abc123.us-east-1.rds.amazonaws.com:5432/app",
      databaseUrlEnv: "DATABASE_URL",
      cleanupPlan: "n/a"
    });
    expect(report.targetKind).toBe("production-like");
    expect(report.connectionTarget).toMatchObject({ blocked: true, kind: "production-like" });
    expect(report.verdict).toBe("plan-blocked");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("s3cret-pass");
    expect(serialized).toContain("env:DATABASE_URL");
    expect(classifyMigrationConnectionTarget({ connectionHost: "localhost" }).kind).toBe("disposable-local");
  });

  it("UAT-DATA-6: disposable cleanup obligation remains proven-false including failed paths", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'ALTER TABLE "User" ADD COLUMN "nickname" text;');
    const failed = analyzeMigrationSafety({
      rootDir: root,
      files: ["migration.sql"],
      targetKind: "disposable-local",
      cleanupPlan: "drop volume codedecay-mig",
      rollbackFailed: true
    });
    expect(failed.cleanup).toMatchObject({
      required: true,
      proven: false,
      requiredOnFailure: true,
      plan: "drop volume codedecay-mig"
    });
    expect(failed.cleanup.limitations.join(" ")).toMatch(/Failed mixed-version or rollback paths still require/i);
    expect(failed.fullyVerified).toBe(false);
  });
});

describe("migration safety analysis", () => {
  it("keeps an additive nullable migration as execution proof rather than a blocker", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'ALTER TABLE "User" ADD COLUMN "nickname" text;');
    const report = analyzeMigrationSafety({
      rootDir: root,
      files: ["migration.sql"],
      targetKind: "disposable-local",
      generatedAt: "2026-08-02T00:00:00.000Z"
    });
    expect(report.operations[0]).toMatchObject({
      kind: "add-column",
      object: "User.nickname",
      risk: "info",
      destructive: false,
      requiresBackfill: false
    });
    expect(report.blockers).toEqual([]);
    expect(report.matrix.find((item) => item.state === "old-app-new-schema")?.status).toBe("needs-proof");
    expect(report.safety).toEqual({
      commandsExecuted: false,
      databaseConnected: false,
      migrationApplied: false,
      secretsRead: false,
      productionTargetAllowed: false
    });
  });

  it("blocks a non-null column without a default and destructive rolling deployment", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'ALTER TABLE "User" ADD COLUMN "email" text NOT NULL; ALTER TABLE "User" DROP COLUMN "name";');
    const report = analyzeMigrationSafety({ rootDir: root, files: ["migration.sql"], targetKind: "disposable-local" });
    expect(report.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "add-column", risk: "blocker", requiresBackfill: true }),
        expect.objectContaining({ kind: "drop-column", risk: "blocker", destructive: true })
      ])
    );
    expect(report.matrix.find((item) => item.state === "old-app-new-schema")).toMatchObject({ status: "blocked" });
    expect(report.matrix.find((item) => item.state === "rollback")).toMatchObject({
      status: "blocked",
      reason: "No rollback SQL was supplied."
    });
  });

  it("blocks production-like targets without reading a connection string", () => {
    const root = tempRoot();
    write(root, "migration.sql", 'CREATE TABLE "Audit" ("id" text PRIMARY KEY);');
    const report = analyzeMigrationSafety({ rootDir: root, files: ["migration.sql"], targetKind: "production-like" });
    expect(report.blockers[0]).toContain("Production-like database targets are blocked");
    expect(report.matrix.filter((item) => item.state !== "old-app-old-schema").every((item) => item.status === "blocked")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("DATABASE_URL");
  });

  it("rejects malformed SQL and paths that escape through symlinks", async () => {
    const { symlinkSync } = await import("node:fs");
    const root = tempRoot();
    const outside = tempRoot();
    write(root, "bad.sql", "ALTER TABLE ???");
    write(outside, "outside.sql", "DROP TABLE users;");
    symlinkSync(join(outside, "outside.sql"), join(root, "linked.sql"));
    expect(() => analyzeMigrationSafety({ rootDir: root, files: ["bad.sql"] })).toThrow("Unable to parse PostgreSQL migration");
    expect(() => analyzeMigrationSafety({ rootDir: root, files: ["linked.sql"] })).toThrow("must stay inside repository");
  });

  it("validates rollback SQL and blocks an unspecified target", () => {
    const root = tempRoot();
    write(root, "up.sql", 'ALTER TABLE "User" ADD COLUMN "nickname" text;');
    write(root, "down.sql", "ALTER TABLE ???");
    expect(() =>
      analyzeMigrationSafety({ rootDir: root, files: ["up.sql"], rollbackFiles: ["down.sql"], targetKind: "disposable-local" })
    ).toThrow("Unable to parse PostgreSQL migration down.sql");
    write(root, "down.sql", 'ALTER TABLE "User" DROP COLUMN "nickname";');
    const report = analyzeMigrationSafety({ rootDir: root, files: ["up.sql"], rollbackFiles: ["down.sql"] });
    expect(report.rollbackFiles).toEqual(["down.sql"]);
    expect(report.blockers[0]).toContain("target classification is required");
    expect(report.matrix.find((item) => item.state === "new-app-new-schema")?.status).toBe("blocked");
  });
});

function tempRoot(): string {
  const root = join(tmpdir(), `codedecay-migration-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  writeFileSync(join(root, path), content, "utf8");
}
