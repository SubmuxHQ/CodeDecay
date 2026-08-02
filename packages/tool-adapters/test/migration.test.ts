import { describe, expect, it } from "vitest";
import { createPrismaMigrationAdapterPlan } from "../src/index";

describe("Prisma migration adapter plan", () => {
  it("creates an approved read-only local schema diff plan", () => {
    const plan = createPrismaMigrationAdapterPlan({
      provider: "prisma",
      fromSchema: "fixtures/base/schema.prisma",
      toSchema: "prisma/schema.prisma",
      targetKind: "disposable-local",
      approved: true,
      timeoutMs: 30_000,
      cleanupPlan: "Delete the disposable database directory.",
      secretEnvNames: ["TEST_DATABASE_URL"]
    });
    expect(plan).toMatchObject({ provider: "prisma", mode: "schema-diff", executable: true, blockers: [], safety: { readOnly: true, databaseConnected: false, migrationApplied: false } });
    expect(plan.command).toBe("prisma migrate diff --from-schema 'fixtures/base/schema.prisma' --to-schema 'prisma/schema.prisma' --script --exit-code");
  });

  it("blocks unapproved and production-like plans", () => {
    const plan = createPrismaMigrationAdapterPlan({ provider: "prisma", fromSchema: "base.prisma", toSchema: "head.prisma", targetKind: "production-like", approved: false, timeoutMs: 1000, cleanupPlan: "No resources created.", secretEnvNames: [] });
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toHaveLength(2);
  });

  it("rejects remote paths, missing cleanup, and secret values", () => {
    const valid = { provider: "prisma" as const, fromSchema: "base.prisma", toSchema: "head.prisma", targetKind: "disposable-local" as const, approved: true, timeoutMs: 1000, cleanupPlan: "cleanup", secretEnvNames: [] };
    expect(() => createPrismaMigrationAdapterPlan({ ...valid, fromSchema: "https://example.com/schema.prisma" })).toThrow("repo-local path");
    expect(() => createPrismaMigrationAdapterPlan({ ...valid, cleanupPlan: "" })).toThrow("cleanupPlan is required");
    expect(() => createPrismaMigrationAdapterPlan({ ...valid, secretEnvNames: ["postgres://secret"] })).toThrow("environment variable names only");
  });
});
