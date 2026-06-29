import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditProjectPath,
  CODEDECAY_AUDIT_DATA_DIR,
  createAuditContentHash,
  createAuditProjectRecord,
  loadAuditProjectRecord,
  sanitizeAuditProjectId,
  saveAuditProjectRecord,
  upsertAuditFileRecord,
  upsertAuditRun,
  type AuditFileHistoryEntry
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("audit data model", () => {
  it("creates deterministic content hashes and local project paths", () => {
    expect(createAuditContentHash("hello")).toBe("sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(sanitizeAuditProjectId(" SubmuxHQ/CodeDecay ")).toBe("submuxhq-codedecay");
    expect(auditProjectPath("/repo", "SubmuxHQ/CodeDecay")).toBe(join("/repo", CODEDECAY_AUDIT_DATA_DIR, "submuxhq-codedecay", "project.json"));
  });

  it("upserts runs and file records idempotently for unchanged file hashes", () => {
    let project = createAuditProjectRecord({
      projectId: "codedecay",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    project = upsertAuditRun(project, {
      schemaVersion: 1,
      id: "run-1",
      status: "completed",
      startedAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:02.000Z",
      limitations: [],
      filePaths: ["src/auth/session.ts"]
    });

    const history: AuditFileHistoryEntry = {
      runId: "run-1",
      contentHash: createAuditContentHash("export const ok = true;"),
      status: "analyzed",
      analyzedAt: "2026-01-01T00:00:02.000Z",
      limitations: []
    };
    const file = {
      path: "src/auth/session.ts",
      contentHash: history.contentHash,
      language: "typescript",
      languageStatus: "supported" as const,
      status: "analyzed" as const,
      candidates: [],
      findings: [],
      limitations: [],
      updatedAt: history.analyzedAt
    };

    project = upsertAuditFileRecord(project, file, history);
    project = upsertAuditFileRecord(project, file, history);

    expect(project.runs).toHaveLength(1);
    expect(project.files["src/auth/session.ts"]?.history).toHaveLength(1);
    expect(project.files["src/auth/session.ts"]).toMatchObject({
      status: "analyzed",
      language: "typescript",
      languageStatus: "supported"
    });
  });

  it("represents skipped capped and unsupported files with limitations", () => {
    let project = createAuditProjectRecord({
      projectId: "codedecay",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const history: AuditFileHistoryEntry = {
      runId: "run-2",
      contentHash: createAuditContentHash("large file"),
      status: "capped",
      analyzedAt: "2026-01-01T00:00:03.000Z",
      limitations: ["File exceeded configured audit byte cap."]
    };

    project = upsertAuditFileRecord(
      project,
      {
        path: "src/generated/client.ts",
        contentHash: history.contentHash,
        language: "typescript",
        languageStatus: "supported",
        status: "capped",
        candidates: [],
        findings: [],
        limitations: history.limitations,
        updatedAt: history.analyzedAt
      },
      history
    );

    project = upsertAuditFileRecord(
      project,
      {
        path: "src/service.rb",
        contentHash: createAuditContentHash("puts 'hello'"),
        language: "ruby",
        languageStatus: "unsupported",
        status: "unsupported",
        candidates: [],
        findings: [],
        limitations: ["No parser adapter is registered for ruby."],
        updatedAt: "2026-01-01T00:00:04.000Z"
      },
      {
        runId: "run-2",
        contentHash: createAuditContentHash("puts 'hello'"),
        status: "unsupported",
        analyzedAt: "2026-01-01T00:00:04.000Z",
        limitations: ["No parser adapter is registered for ruby."]
      }
    );

    expect(project.files["src/generated/client.ts"]?.status).toBe("capped");
    expect(project.files["src/service.rb"]?.languageStatus).toBe("unsupported");
    expect(project.files["src/service.rb"]?.limitations).toEqual(["No parser adapter is registered for ruby."]);
  });

  it("loads missing stores as empty projects and writes stores safely", () => {
    const root = mkTempRoot();
    const empty = loadAuditProjectRecord(root, "CodeDecay");

    expect(empty.projectId).toBe("CodeDecay");
    expect(empty.files).toEqual({});

    const savedPath = saveAuditProjectRecord(root, {
      ...empty,
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const loaded = loadAuditProjectRecord(root, "CodeDecay");

    expect(savedPath).toBe(join(root, CODEDECAY_AUDIT_DATA_DIR, "codedecay", "project.json"));
    expect(loaded.projectId).toBe("CodeDecay");
  });
});

function mkTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-audit-"));
  tempRoots.push(root);
  return root;
}
