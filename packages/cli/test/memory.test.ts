import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createRepo, createTempDir, run, writeFile } from "./helpers";

describe("codedecay memory CLI contract", () => {
  it("prints memory defaults", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["memory", "--format", "json"], repo);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(parsed.memory.version).toBe(1);
    for (const section of ["flows", "commands", "invariants", "architecture", "regressions"]) {
      expect(parsed.memory[section]).toEqual([]);
    }
  });

  it("loads memory from --cwd and renders markdown", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeFile(
      repo,
      ".codedecay/memory.json",
      JSON.stringify(
        {
          version: 1,
          flows: [{ name: "Checkout", areas: ["api"], checks: ["failed card retry"] }]
        },
        null,
        2
      )
    );

    const result = await run(["memory", "--cwd", repo, "--format", "markdown"], outsideCwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Memory");
    expect(result.stdout).toContain("| Flows | 1 |");
  });

  it("adds memory context to analyze reports", async () => {
    const repo = createRepo({
      "src/auth/session.ts": "export function session() { return true; }\n",
      ".codedecay/memory.json": JSON.stringify(
        {
          version: 1,
          flows: [{ name: "Login flow", areas: ["auth"], checks: ["missing token"] }],
          commands: [{ name: "Auth tests", command: "pnpm test auth", areas: ["auth"] }],
          invariants: [
            {
              name: "Auth fails closed",
              description: "Missing users must not become admins.",
              areas: ["auth"],
              severity: "high"
            }
          ],
          architecture: [],
          regressions: [
            {
              title: "Anonymous admin",
              description: "Fallback user became admin.",
              areas: ["auth"],
              check: "missing token request"
            }
          ]
        },
        null,
        2
      )
    });
    writeFile(repo, "src/auth/session.ts", "export function session() { return { role: 'admin' }; }\n");

    const result = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.findings.map((finding: { ruleId: string }) => finding.ruleId)).toEqual(
      expect.arrayContaining(["memory-invariant-impacted", "memory-past-regression-area"])
    );
    expect(report.recommendedTests).toEqual(
      expect.arrayContaining([
        "Verify invariant: Auth fails closed",
        "Regression check: missing token request",
        "Verify flow: Login flow",
        "Flow check (Login flow): missing token",
        "Run project command: Auth tests (pnpm test auth)"
      ])
    );
  });

  it("prints non-mutating memory setup guidance by default", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["memory", "setup", "--provider", "all", "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Memory Setup");
    expect(result.stdout).toContain("### Local .codedecay memory");
    expect(result.stdout).toContain("### Mem0");
    expect(result.stdout).toContain("### Supermemory");
    expect(result.stdout).toContain("Dry-run is the default");
    expect(existsSync(join(repo, ".codedecay/local/memory-providers.yml"))).toBe(false);
    expect(existsSync(join(repo, ".codedecay/config.yml"))).toBe(false);
  });

  it("writes a reviewable memory setup snippet only with --apply", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run([
      "memory",
      "setup",
      "--cwd",
      repo,
      "--provider",
      "mem0",
      "--apply",
      "--format",
      "json"
    ], outsideCwd);
    const parsed = JSON.parse(result.stdout);
    const writtenPath = join(repo, ".codedecay/local/memory-providers.yml");
    const written = readFileSync(writtenPath, "utf8");

    expect(result.exitCode).toBe(0);
    expect(parsed.apply).toBe(true);
    expect(parsed.writtenPath).toContain(".codedecay/local/memory-providers.yml");
    expect(parsed.safety.packagesInstalled).toBe(false);
    expect(parsed.safety.networkCalled).toBe(false);
    expect(parsed.safety.trackedConfigWritten).toBe(false);
    expect(written).toContain("provider: mem0");
    expect(written).toContain("enabled: false");
    expect(written).toContain("MEM0_API_KEY");
    expect(written).not.toContain("supermemory");
    expect(existsSync(join(repo, ".codedecay/config.yml"))).toBe(false);
  });

  it("rejects unknown memory setup providers", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["memory", "setup", "--provider", "hosted"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--provider must be local, mem0, supermemory, or all");
  });

  it("previews and applies structured memory imports", async () => {
    const repo = createLowRiskRepo();
    const importPath = join(repo, "memory-import.json");
    writeFile(
      repo,
      "memory-import.json",
      JSON.stringify(
        {
          version: 1,
          incidents: [
            {
              title: "Anonymous admin",
              description: "Tokenless request became admin.",
              check: "request protected route without token",
              areas: ["auth"]
            }
          ],
          pullRequests: [
            {
              title: "Billing rollout",
              description: "Merged rollout changed invoice flow.",
              checks: ["invoice retry path"],
              command: "pnpm test billing",
              areas: ["api", "ui"]
            }
          ]
        },
        null,
        2
      )
    );

    const preview = await run(["memory-import", "--input", importPath], repo);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain("## CodeDecay Memory Import");
    expect(preview.stdout).toContain("preview only");

    const applied = await run(["memory-import", "--input", importPath, "--apply", "--format", "json"], repo);
    const parsed = JSON.parse(applied.stdout);
    expect(applied.exitCode).toBe(0);
    expect(parsed.writtenPath).toContain(".codedecay/memory.json");
    expect(parsed.memory.regressions).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Anonymous admin" })]));
    expect(parsed.memory.commands).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Billing rollout check" })]));
  });

  it("learns memory from CI, PR, and CodeDecay report inputs", async () => {
    const repo = createLowRiskRepo();
    const inputPath = join(repo, "memory-learn.json");
    writeFile(
      repo,
      "memory-learn.json",
      JSON.stringify(
        {
          ciFailures: [
            {
              title: "Auth smoke failed",
              message: "Token refresh returned 401 after deploy.",
              command: "pnpm test auth",
              files: ["src/auth/session.ts"]
            }
          ],
          pullRequests: [
            {
              title: "fix: auth token not refreshing on 401",
              body: "Restores session refresh for expired access tokens.",
              commits: ["fix auth retry path"],
              changedFiles: ["src/app/api/session/route.ts"],
              checks: ["expired token refresh"]
            }
          ],
          reports: [
            {
              tool: "CodeDecay",
              findings: [
                {
                  ruleId: "missing-nearby-tests",
                  title: "Risky source changes without changed tests",
                  description: "Auth source changed without a test update.",
                  severity: "high",
                  file: "src/auth/session.ts"
                }
              ],
              impactedAreas: [{ kind: "auth" }],
              recommendedTests: ["Add missing-token auth regression test"]
            }
          ]
        },
        null,
        2
      )
    );

    const preview = await run(["memory-learn", "--input", inputPath], repo);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain("## CodeDecay Memory Learn");
    expect(preview.stdout).toContain("preview only");
    expect(preview.stdout).toContain("| Past regressions | 3 | 3 | 0 |");

    const applied = await run(["memory-learn", "--input", inputPath, "--apply", "--format", "json"], repo);
    const parsed = JSON.parse(applied.stdout);
    expect(applied.exitCode).toBe(0);
    expect(parsed.writtenPath).toContain(".codedecay/memory.json");
    expect(parsed.learned.regressions).toBe(3);
    expect(parsed.memory.commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Auth smoke failed check", command: "pnpm test auth" })])
    );
    expect(parsed.memory.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Auth smoke failed" }),
        expect.objectContaining({ title: "CodeDecay: Risky source changes without changed tests" })
      ])
    );
  });

  it("learns memory from product verification reports", async () => {
    const repo = createLowRiskRepo();
    const inputPath = join(repo, "product-report.json");
    writeFile(
      repo,
      "product-report.json",
      JSON.stringify(
        {
          tool: "CodeDecay",
          targets: [
            {
              id: "web",
              status: "passed",
              generatedTests: {
                status: "passed",
                tests: [
                  {
                    id: "route-settings",
                    title: "loads /settings",
                    kind: "route-load",
                    pageUrl: "http://127.0.0.1:3000/settings?token=secret",
                    priority: "medium"
                  }
                ]
              },
              generatedTestRun: {
                status: "passed",
                passed: 1,
                failed: 0,
                skipped: 0,
                failures: []
              }
            }
          ]
        },
        null,
        2
      )
    );

    const preview = await run(["memory-learn", "--input", inputPath], repo);
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain("## CodeDecay Memory Learn");
    expect(preview.stdout).toContain("| Flows | 1 | 1 | 0 |");

    const applied = await run(["memory-learn", "--input", inputPath, "--apply", "--format", "json"], repo);
    const parsed = JSON.parse(applied.stdout);

    expect(applied.exitCode).toBe(0);
    expect(parsed.memory.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Product check: web: loads /settings",
          productPaths: ["/settings"]
        })
      ])
    );
    expect(JSON.stringify(parsed.memory)).not.toContain("token=secret");
  });
});
