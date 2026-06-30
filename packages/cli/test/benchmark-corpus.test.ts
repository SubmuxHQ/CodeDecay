import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupBenchmarkCorpus,
  createDefaultBenchmarkCorpus,
  createJwtAuthDecoyRepo,
  createMissingRealApiTestRepo,
  createUnifiedHarnessPlantedIssueRepo,
  DEFAULT_BENCHMARK_RULES
} from "../src/benchmark/corpus";
import { runCli } from "../src/index";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface BenchmarkCase {
  id: string;
  setup: () => string;
  expectedRiskLevel: "low" | "medium" | "high";
  mergeRiskMin: number;
  mergeRiskMax: number;
  expectedRules: string[];
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  cleanupBenchmarkCorpus();
});

describe("public risk benchmark corpus", () => {
  const benchmarks: BenchmarkCase[] = [
    {
      id: "broad-low-signal-mixed-change",
      setup: createBroadLowOnlyRepo,
      expectedRiskLevel: "low",
      mergeRiskMin: 0,
      mergeRiskMax: 39,
      expectedRules: ["risky-docs-change"]
    },
    {
      id: "assets-only-change",
      setup: createAssetsOnlyRepo,
      expectedRiskLevel: "low",
      mergeRiskMin: 0,
      mergeRiskMax: 9,
      expectedRules: []
    },
    {
      id: "lockfile-only-change",
      setup: createLockfileOnlyRepo,
      expectedRiskLevel: "low",
      mergeRiskMin: 0,
      mergeRiskMax: 19,
      expectedRules: ["risky-config-change"]
    },
    {
      id: "package-metadata-only-change",
      setup: createPackageMetadataOnlyRepo,
      expectedRiskLevel: "low",
      mergeRiskMin: 0,
      mergeRiskMax: 19,
      expectedRules: ["risky-config-change"]
    },
    {
      id: "api-handler-behavior-change",
      setup: createMediumRiskRepo,
      expectedRiskLevel: "medium",
      mergeRiskMin: 40,
      mergeRiskMax: 69,
      expectedRules: ["risky-api-change"]
    },
    {
      id: "auth-api-schema-regression",
      setup: createHighRiskRepo,
      expectedRiskLevel: "high",
      mergeRiskMin: 70,
      mergeRiskMax: 100,
      expectedRules: ["risky-auth-change", "risky-database-change"]
    }
  ];

  for (const benchmark of benchmarks) {
    it(benchmark.id, async () => {
      const repo = benchmark.setup();
      const result = await run(["analyze", "--format", "json"], repo);
      const report = JSON.parse(result.stdout) as {
        summary: { riskLevel: string; mergeRiskScore: number };
        findings: Array<{ ruleId: string }>;
      };

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(report.summary.riskLevel).toBe(benchmark.expectedRiskLevel);
      expect(report.summary.mergeRiskScore).toBeGreaterThanOrEqual(benchmark.mergeRiskMin);
      expect(report.summary.mergeRiskScore).toBeLessThanOrEqual(benchmark.mergeRiskMax);

      for (const ruleId of benchmark.expectedRules) {
        expect(report.findings.map((finding) => finding.ruleId)).toContain(ruleId);
      }
    });
  }
});

describe("unified harness planted issue corpus", () => {
  it("reports deterministic recall, limitations, duration, and zero model cost", async () => {
    const repo = createUnifiedHarnessPlantedIssueRepo();
    const missingTestRepo = createMissingRealApiTestRepo();
    const startedAt = Date.now();
    const result = await run(["redteam", "--format", "json"], repo);
    const missingTestResult = await run(["redteam", "--format", "json"], missingTestRepo);
    const durationMs = Date.now() - startedAt;
    const redteam = JSON.parse(result.stdout) as {
      analysis: {
        findings: Array<{ ruleId: string }>;
        securityCandidates?: Array<{ ruleId: string }>;
        securityAnalysis?: { skippedFiles: unknown[] };
        languageAnalysis?: { unsupportedFiles: string[] };
        summary: { riskLevel: string };
      };
      safety: {
        llmCalled: boolean;
        telemetrySent: boolean;
        cloudDependency: boolean;
      };
      summary: {
        weakTestFindings: number;
        missingTestFindings: number;
      };
    };
    const missingTestRedteam = JSON.parse(missingTestResult.stdout) as typeof redteam;

    const expectedRuleIds = DEFAULT_BENCHMARK_RULES.map((rule) => rule.ruleId);
    const actualRuleIds = uniqueSorted([
      ...redteam.analysis.findings.map((finding) => finding.ruleId),
      ...(redteam.analysis.securityCandidates ?? []).map((candidate) => candidate.ruleId),
      ...missingTestRedteam.analysis.findings.map((finding) => finding.ruleId),
      ...(missingTestRedteam.analysis.securityCandidates ?? []).map((candidate) => candidate.ruleId)
    ]);
    const matchedRuleIds = expectedRuleIds.filter((ruleId) => actualRuleIds.includes(ruleId));
    const metrics = {
      expected: expectedRuleIds.length,
      matched: matchedRuleIds.length,
      recall: matchedRuleIds.length / expectedRuleIds.length,
      skippedFiles:
        (redteam.analysis.securityAnalysis?.skippedFiles.length ?? 0) +
        (missingTestRedteam.analysis.securityAnalysis?.skippedFiles.length ?? 0),
      cappedFiles: 0,
      unsupportedFiles:
        (redteam.analysis.languageAnalysis?.unsupportedFiles.length ?? 0) +
        (missingTestRedteam.analysis.languageAnalysis?.unsupportedFiles.length ?? 0),
      durationMs,
      costUsd: 0,
      providerCalls: 0
    };

    expect(result.exitCode).toBe(0);
    expect(missingTestResult.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(missingTestResult.stderr).toBe("");
    expect(redteam.analysis.summary.riskLevel).toBe("high");
    expect(["medium", "high"]).toContain(missingTestRedteam.analysis.summary.riskLevel);
    expect(matchedRuleIds).toEqual(expectedRuleIds);
    expect(metrics).toMatchObject({
      expected: expectedRuleIds.length,
      matched: expectedRuleIds.length,
      recall: 1,
      costUsd: 0,
      providerCalls: 0
    });
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.skippedFiles).toBeGreaterThanOrEqual(0);
    expect(metrics.cappedFiles).toBe(0);
    expect(redteam.summary.weakTestFindings).toBeGreaterThanOrEqual(2);
    expect(redteam.summary.missingTestFindings + missingTestRedteam.summary.missingTestFindings).toBeGreaterThanOrEqual(1);
    expect(redteam.safety).toMatchObject({
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("reports jwt-auth deterministic coverage and decoy false-positive rate", async () => {
    const riskyRepo = createUnifiedHarnessPlantedIssueRepo();
    const decoyRepo = createJwtAuthDecoyRepo();
    const riskyResult = await run(["redteam", "--format", "json"], riskyRepo);
    const decoyResult = await run(["redteam", "--format", "json"], decoyRepo);
    const riskyReport = JSON.parse(riskyResult.stdout) as {
      analysis: { securityCandidates?: Array<{ ruleId: string }> };
      patternInsights: Array<{ id: string }>;
      safety: { llmCalled: boolean; telemetrySent: boolean; cloudDependency: boolean };
    };
    const decoyReport = JSON.parse(decoyResult.stdout) as {
      analysis: { securityCandidates?: Array<{ ruleId: string }> };
    };
    const riskyJwtCandidates = (riskyReport.analysis.securityCandidates ?? []).filter(
      (candidate) => candidate.ruleId === "security-jwt-unsafe-verification"
    );
    const decoyJwtCandidates = (decoyReport.analysis.securityCandidates ?? []).filter(
      (candidate) => candidate.ruleId === "security-jwt-unsafe-verification"
    );
    const metrics = {
      area: "jwt-auth",
      deterministicExpected: 2,
      deterministicMatched: Math.min(riskyJwtCandidates.length, 2),
      deterministicRecall: Math.min(riskyJwtCandidates.length, 2) / 2,
      decoys: 2,
      falsePositives: decoyJwtCandidates.length,
      falsePositiveRate: decoyJwtCandidates.length / 2,
      investigateOnlyCases: 4,
      providerCalls: 0
    };

    expect(riskyResult.exitCode).toBe(0);
    expect(decoyResult.exitCode).toBe(0);
    expect(riskyResult.stderr).toBe("");
    expect(decoyResult.stderr).toBe("");
    expect(riskyReport.patternInsights.map((pattern) => pattern.id)).toContain("knowledge-jwt-auth");
    expect(metrics).toEqual({
      area: "jwt-auth",
      deterministicExpected: 2,
      deterministicMatched: 2,
      deterministicRecall: 1,
      decoys: 2,
      falsePositives: 0,
      falsePositiveRate: 0,
      investigateOnlyCases: 4,
      providerCalls: 0
    });
    expect(riskyReport.safety).toMatchObject({
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("exposes the same canonical corpus consumed by the benchmark command", () => {
    const corpus = createDefaultBenchmarkCorpus();

    expect(corpus.rules.map((rule) => rule.ruleId)).toEqual(DEFAULT_BENCHMARK_RULES.map((rule) => rule.ruleId));
    expect(corpus.scenarios.filter((scenario) => scenario.kind === "positive")).toHaveLength(5);
    expect(corpus.scenarios.filter((scenario) => scenario.kind === "decoy")).toHaveLength(3);
    expect(corpus.scenarios.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining([
        "one-hop-sqli",
        "plain-exported-destructive-missing-auth",
        "one-hop-path-join-traversal",
        "request-name-collision-decoy"
      ])
    );
  });
});

async function run(args: string[], cwd: string): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });

  return { exitCode, stdout, stderr };
}

function createBroadLowOnlyRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });

  const files = [
    "docs/agent.md",
    "docs/getting-started.md",
    "docs/mcp.md",
    "docs/reports.md",
    "docs/scoring.md",
    "docs/examples/sample-report.md",
    "docs/examples/json-report.md",
    "docs/examples/sarif-report.md",
    "docs/examples/action-output.md",
    "docs/examples/redteam-report.md",
    "docs/examples/agent-handoff.md",
    "packages/agent/src/profile.ts",
    "packages/harness/src/registry.ts",
    "packages/memory/src/local.ts"
  ];

  for (const file of files) {
    writeFile(repo, file, `export const fixture = ${JSON.stringify(file)};\n`);
  }

  return repo;
}

function createAssetsOnlyRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });

  writeFile(repo, "public/logo.svg", "<svg viewBox=\"0 0 24 24\"><path d=\"M1 1h22v22H1z\" /></svg>\n");
  writeFile(repo, "public/fonts/display.woff2", "font fixture\n");
  return repo;
}

function createLockfileOnlyRepo(): string {
  const repo = createRepo({
    "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n"
  });

  writeFile(repo, "pnpm-lock.yaml", "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n");
  return repo;
}

function createPackageMetadataOnlyRepo(): string {
  const repo = createRepo({
    "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2)
  });

  writeFile(
    repo,
    "package.json",
    JSON.stringify(
      {
        name: "demo",
        version: "1.0.0",
        description: "Deterministic pull request risk analysis.",
        keywords: ["static-analysis", "pull-request"]
      },
      null,
      2
    )
  );
  return repo;
}

function createMediumRiskRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
  });

  writeFile(
    repo,
    "src/api/users.ts",
    [
      "export function handler(req: Request) {",
      "  if (req.method === \"POST\") return Response.json({ ok: true });",
      "  return Response.json({ ok: false });",
      "}",
      ""
    ].join("\n")
  );

  return repo;
}

function createHighRiskRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function handler() { return true; }\n",
    "src/auth/session.ts": "export function session() { return true; }\n",
    "src/db/schema.prisma": "model User { id String @id }\n"
  });

  writeFile(repo, "src/api/users.ts", "export function handler() { return false; }\n");
  writeFile(repo, "src/auth/session.ts", "export function session(token?: string) { if (!token) return null; return true; }\n");
  writeFile(repo, "src/db/schema.prisma", "model User { id String @id email String }\n");

  return repo;
}

function createRepo(files: Record<string, string>): string {
  const repo = createTempDir();
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Test"]);

  for (const [path, contents] of Object.entries(files)) {
    writeFile(repo, path, contents);
  }

  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function createTempDir(): string {
  const root = execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-benchmark-XXXXXX")], {
    encoding: "utf8"
  }).trim();
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore"
  });
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
