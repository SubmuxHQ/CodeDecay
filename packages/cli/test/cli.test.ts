import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HealthServer {
  origin: string;
  healthUrl: string;
  close: () => Promise<void>;
}

interface DemoAppServer {
  origin: string;
  close: () => Promise<void>;
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("codedecay analyze CLI contract", () => {
  it("renders JSON and markdown to stdout", async () => {
    const repo = createLowRiskRepo();

    const json = await run(["analyze", "--format", "json"], repo);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "low"
      }
    });

    const markdown = await run(["analyze", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Report");
    expect(markdown.stdout).toContain("Merge risk");
  });

  it("writes SARIF with --output and resolves relative output from --cwd", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(
      ["analyze", "--cwd", repo, "--format", "sarif", "--output", "codedecay.sarif"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay.sarif");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      version: "2.1.0"
    });
  });

  it("keeps absolute --output paths absolute", async () => {
    const repo = createLowRiskRepo();
    const outputPath = join(createTempDir(), "absolute-output.json");

    const result = await run(["analyze", "--format", "json", "--output", outputPath], repo);

    expect(result.exitCode).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8")).tool).toBe("CodeDecay");
  });

  it("uses --cwd as the repository being analyzed", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["analyze", "--cwd", repo, "--format", "json"], outsideCwd);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(report.summary.riskLevel).toBe("medium");
  });

  it("reports framework-aware route and API impacts", async () => {
    const repo = createNextRouteRiskRepo();

    const json = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(report.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"],
          risk: "high"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard",
          methods: [],
          risk: "medium"
        })
      ])
    );

    const markdown = await run(["analyze", "--format", "markdown"], repo);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("### Likely Impacted Routes And APIs");
    expect(markdown.stdout).toContain("High `GET, POST /api/users` (Next.js API route)");
    expect(markdown.stdout).toContain("Medium `/dashboard` (Next.js UI route)");
  });

  it("returns correct exit codes for --fail-on thresholds", async () => {
    const lowRepo = createLowRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], lowRepo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], lowRepo, 0);
    await expectExit(["analyze", "--fail-on", "low"], lowRepo, 1);

    const mediumRepo = createMediumRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], mediumRepo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], mediumRepo, 1);
    await expectExit(["analyze", "--fail-on", "low"], mediumRepo, 1);

    const highRepo = createHighRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], highRepo, 1);
    await expectExit(["analyze", "--fail-on", "medium"], highRepo, 1);
    await expectExit(["analyze", "--fail-on", "low"], highRepo, 1);
  });

  it("does not fail the high gate for broad low-severity docs/source/test changes", async () => {
    const repo = createBroadLowOnlyRepo();
    const result = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      mergeRiskScore: 39,
      riskLevel: "low"
    });
    expect(report.summary.findingCounts.low).toBeGreaterThanOrEqual(12);

    await expectExit(["analyze", "--fail-on", "high"], repo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], repo, 0);
    await expectExit(["analyze", "--fail-on", "low"], repo, 1);
  });

  it("fails clearly for invalid base/head refs", async () => {
    const repo = createLowRiskRepo();

    const result = await run(
      ["analyze", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"],
      repo
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
    expect(result.stderr).toContain("Check --base/--head and fetch the ref before running CodeDecay.");
  });

  it("fails clearly for invalid head refs", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["analyze", "--head", "definitely-missing-head", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-head".');
    expect(result.stderr).toContain("Check --base/--head and fetch the ref before running CodeDecay.");
  });

  it("fails clearly outside a git repository", async () => {
    const nonGitDir = createTempDir();

    const result = await run(["analyze", "--format", "json"], nonGitDir);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `CodeDecay failed: ${nonGitDir} is not a git repository. Run from a git repo or pass --cwd <repo>.\n`
    );
  });

  it("has deterministic report content after ignoring generatedAt", async () => {
    const repo = createMediumRiskRepo();

    const first = stableReport((await run(["analyze", "--format", "json"], repo)).stdout);
    const second = stableReport((await run(["analyze", "--format", "json"], repo)).stdout);

    expect(second).toEqual(first);
  });
});

describe("codedecay CLI discovery commands", () => {
  it("prints root help, command help, and manual pages", async () => {
    const cwd = createTempDir();

    const rootHelp = await run(["help"], cwd);
    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.stdout).toContain("codedecay help [command]");
    expect(rootHelp.stdout).toContain("update");

    const commandHelp = await run(["help", "analyze"], cwd);
    expect(commandHelp.exitCode).toBe(0);
    expect(commandHelp.stdout).toContain("CodeDecay analyze");
    expect(commandHelp.stdout).toContain("--fail-on <level>");

    const inlineHelp = await run(["analyze", "--help"], cwd);
    expect(inlineHelp.exitCode).toBe(0);
    expect(inlineHelp.stdout).toContain("CodeDecay analyze");
    expect(inlineHelp.stdout).toContain("codedecay analyze [options]");

    const manual = await run(["man", "update"], cwd);
    expect(manual.exitCode).toBe(0);
    expect(manual.stdout).toContain("CODEDECAY-UPDATE(1)");
    expect(manual.stdout).toContain("OPTIONS");
  });

  it("prints version and update guidance", async () => {
    const cwd = createTempDir();
    writeFile(
      cwd,
      "package.json",
      JSON.stringify(
        {
          name: "demo-repo",
          private: true,
          packageManager: "pnpm@11.8.0"
        },
        null,
        2
      )
    );

    const version = await run(["version"], cwd);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe(currentCliVersion());

    const update = await run(["update"], cwd);
    expect(update.exitCode).toBe(0);
    expect(update.stdout).toContain("Package manager: pnpm (package.json#packageManager)");
    expect(update.stdout).toContain("pnpm add -D @submuxhq/codedecay@latest");
    expect(update.stdout).toContain('Run "codedecay update --apply" to execute it automatically.');
  });

  it("prints uninstall guidance and purge targets", async () => {
    const cwd = createTempDir();
    writeFile(
      cwd,
      "package.json",
      JSON.stringify(
        {
          name: "demo-repo",
          private: true,
          packageManager: "pnpm@11.8.0",
          devDependencies: {
            "@submuxhq/codedecay": currentCliVersion()
          }
        },
        null,
        2
      )
    );
    writeFile(cwd, ".codedecay/config.yml", "version: 1\n");
    writeFile(cwd, "codedecay-redteam.md", "# report\n");

    const result = await run(["uninstall", "--purge-local"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Package manager: pnpm (package.json#packageManager)");
    expect(result.stdout).toContain(`Package entry: devDependencies (${currentCliVersion()})`);
    expect(result.stdout).toContain("pnpm remove @submuxhq/codedecay");
    expect(result.stdout).toContain(".codedecay");
    expect(result.stdout).toContain("codedecay-redteam.md");
    expect(result.stdout).toContain("does not rewrite CI workflows");
  });

  it("can apply a local-only uninstall purge", async () => {
    const cwd = createTempDir();
    writeFile(cwd, ".codedecay/config.yml", "version: 1\n");
    writeFile(cwd, "codedecay.sarif", "{}\n");

    const result = await run(["uninstall", "--purge-local", "--apply"], cwd);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, ".codedecay"))).toBe(false);
    expect(existsSync(join(cwd, "codedecay.sarif"))).toBe(false);
  });

  it("suggests the closest command for unknown command typos", async () => {
    const cwd = createTempDir();

    const result = await run(["analyz"], cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Unknown command: analyz. Did you mean "analyze"?');
    expect(result.stderr).toContain('Run "codedecay help" for available commands.');
  });

  it("suggests the closest option for unknown flag typos", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["analyze", "--failonn"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      'CodeDecay failed: Unknown option for codedecay analyze: --failonn. Did you mean "--fail-on"?'
    );
    expect(result.stderr).toContain('Run "codedecay help analyze" to see supported options.');
  });
});

describe("codedecay config CLI contract", () => {
  it("prints safe defaults when config is missing", async () => {
    const cwd = createTempDir();
    const result = await run(["config"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      config: {
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
      }
    });
  });

  it("loads config from --cwd and renders markdown", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test: pnpm test",
        "  build: pnpm build",
        "toolAdapters:",
        "  playwright: true",
        "  schemathesis:",
        "    schema: docs/openapi.yaml",
        "    baseUrl: http://127.0.0.1:4000",
        "productTesting:",
        "  targets:",
        "    web:",
        "      baseUrl: http://127.0.0.1:3000",
        "      healthCheck: http://127.0.0.1:3000/api/health",
        "      timeoutMs: 60000",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: LITELLM_API_KEY",
        "safety:",
        "  commandTimeoutMs: 45000",
        ""
      ].join("\n")
    );

    const result = await run(["config", "--cwd", repo, "--format", "markdown"], outsideCwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Config");
    expect(result.stdout).toContain(".codedecay/config.yml");
    expect(result.stdout).toContain("`pnpm test`");
    expect(result.stdout).toContain("45000ms");
    expect(result.stdout).toContain("### LLM");
    expect(result.stdout).toContain("| Provider | litellm |");
    expect(result.stdout).toContain("| API key env | `LITELLM_API_KEY` |");
    expect(result.stdout).toContain("### Tool Adapters");
    expect(result.stdout).toContain("| Playwright | yes | command: default | default |");
    expect(result.stdout).toContain("schema: `docs/openapi.yaml`");
    expect(result.stdout).toContain("### Product Testing Targets");
    expect(result.stdout).toContain("| web | ready (base-url) | `http://127.0.0.1:3000`");
    expect(result.stdout).toContain("Config inspection does not execute product target commands.");
  });

  it("fails clearly for invalid config files", async () => {
    const cwd = createTempDir();
    writeFile(cwd, ".codedecay/config.yml", "version: 2\n");

    const result = await run(["config"], cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CodeDecay failed: Invalid CodeDecay config");
    expect(result.stderr).toContain("version must be 1");
  });
});

describe("codedecay llm-review CLI contract", () => {
  it("fails clearly when llm review is not configured", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["llm-review", "--ping"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: LLM review requires llm.provider to be set to "ollama" or "litellm".');
    expect(result.stderr).toContain('codedecay config --format markdown');
  });

  it("fails clearly when a configured LiteLLM API key env var is missing", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: MISSING_LITELLM_API_KEY",
        ""
      ].join("\n")
    );

    const result = await run(["llm-review", "--ping"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("LiteLLM provider could not read API key from environment variable MISSING_LITELLM_API_KEY.");
    expect(result.stderr).toContain('codedecay llm-review --ping');
  });

  it("renders structured suggestions from a configured LiteLLM provider", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: LITELLM_API_KEY",
        ""
      ].join("\n")
    );

    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.LITELLM_API_KEY;
    process.env.LITELLM_API_KEY = "test-key";
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    {
                      title: "Auth negative path",
                      detail: "Exercise the missing token route through the real API boundary.",
                      severity: "high",
                      evidence: ["merge risk 39/100", "docs-oriented change still touches repo safety flow"]
                    }
                  ]
                })
              }
            }
          ]
        };
      },
      async text() {
        return "";
      }
    })) as unknown as typeof fetch;

    try {
      const result = await run(["llm-review", "--format", "markdown"], repo);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("## CodeDecay LLM Review");
      expect(result.stdout).toContain("Structured suggestions | 1 |");
      expect(result.stdout).toContain("Auth negative path");
      expect(result.stdout).toContain("LLM suggestions are untrusted");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.LITELLM_API_KEY;
      } else {
        process.env.LITELLM_API_KEY = originalApiKey;
      }
    }
  });
});

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

describe("codedecay snapshot CLI contract", () => {
  it("emits stable JSON snapshots and compares them with a previous artifact", async () => {
    const repo = createLowRiskRepo();

    const current = await run(["snapshot", "--format", "json"], repo);
    const currentSnapshot = JSON.parse(current.stdout);
    expect(current.exitCode).toBe(0);
    expect(currentSnapshot.tool).toBe("CodeDecay");
    expect(currentSnapshot.summary).toHaveProperty("mergeRiskScore");

    const previousPath = join(repo, "previous-snapshot.json");
    writeFile(
      repo,
      "previous-snapshot.json",
      JSON.stringify(
        {
          ...currentSnapshot,
          summary: {
            ...currentSnapshot.summary,
            mergeRiskScore: Math.max(0, currentSnapshot.summary.mergeRiskScore - 5),
            weakTestFindings: 0,
            impactedAreaKinds: []
          }
        },
        null,
        2
      )
    );

    const comparison = await run(["snapshot", "--compare", previousPath, "--format", "markdown"], repo);
    expect(comparison.exitCode).toBe(0);
    expect(comparison.stdout).toContain("## CodeDecay Snapshot Comparison");
    expect(comparison.stdout).toContain("| Merge risk |");
  });
});

describe("codedecay redteam CLI contract", () => {
  it("renders deterministic JSON and markdown redteam reports", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
      toolAdapters: true
    });
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const json = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(report.tool).toBe("CodeDecay");
    expect(report.mode).toBe("deterministic");
    expect(report.summary.riskLevel).toBe("high");
    expect(Object.values(report.safety).filter((value) => value === false)).toHaveLength(4);
    expect(report.edgeCases).toContain("Check missing, expired, malformed, and privilege-escalation credentials.");
    expect(report.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        summary: "Find missed PR risks."
      })
    ]);
    expect(report.configuredChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "test", willRun: false })])
    );
    expect(report.toolAdapterPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "schemathesis",
          command: "st run docs/openapi.yaml --url http://127.0.0.1:4000",
          willRun: false,
          requiresApproval: false
        })
      ])
    );
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    const markdown = await run(["redteam", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Redteam Report");
    expect(markdown.stdout).toContain("### What Could Break");
    expect(markdown.stdout).toContain("### Tool Adapter Plans");
    expect(markdown.stdout).toContain("### Tasks For Your Coding Agent");
    expect(markdown.stdout).toContain("LLM/model called: no");
  });

  it("includes concrete route/API impacts in redteam reports", async () => {
    const repo = createNextRouteRiskRepo();

    const json = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(report.summary.impactedRoutes).toBe(2);
    expect(report.analysis.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"]
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard",
          methods: []
        })
      ])
    );

    const markdown = await run(["redteam", "--format", "markdown"], repo);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("### Likely Impacted Routes And APIs");
    expect(markdown.stdout).toContain("High `GET, POST /api/users` (Next.js API route)");
    expect(markdown.stdout).toContain("Medium `/dashboard` (Next.js UI route)");
  });

  it("uses --cwd and writes relative --output paths from that cwd", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["redteam", "--cwd", repo, "--format", "json", "--output", "codedecay-redteam.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-redteam.json");
    const report = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(report.changedFiles).toBeUndefined();
    expect(report.analysis.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(report.summary.riskLevel).toBe("medium");
  });

  it("uses base/head refs and fail-on thresholds", async () => {
    const repo = createRepo({
      "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
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
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "change api"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const pass = await run(["redteam", "--base", base, "--head", head, "--fail-on", "high"], repo);
    const fail = await run(["redteam", "--base", base, "--head", head, "--fail-on", "medium"], repo);
    const json = await run(["redteam", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(pass.exitCode).toBe(0);
    expect(fail.exitCode).toBe(1);
    expect(report.base).toBe(base);
    expect(report.head).toBe(head);
    expect(report.analysis.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
  });

  it("fails clearly for redteam git errors without emitting a low-risk report", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["redteam", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
  });
});

describe("codedecay agent CLI contract", () => {
  it("renders deterministic JSON and markdown agent task bundles", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
      toolAdapters: true
    });
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const json = await run(["agent", "--format", "json"], repo);
    const bundle = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high"
      },
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(bundle.purpose).toContain("Codex");
    expect(bundle.agentProfile).toMatchObject({
      id: "generic",
      name: "Generic user-owned agent"
    });
    expect(bundle.evidence.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api", "auth"])
    );
    expect(bundle.suggestedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "configured-command",
          command: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
          willRun: false
        }),
        expect.objectContaining({
          source: "tool-adapter",
          kind: "playwright",
          willRun: false
        })
      ])
    );
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    const markdown = await run(["agent", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Agent Task Bundle");
    expect(markdown.stdout).toContain("### Instructions For The Agent");
    expect(markdown.stdout).toContain("### Agent Handoff");
    expect(markdown.stdout).toContain("### Tool Evidence");
    expect(markdown.stdout).toContain("### Safety And Limits");
    expect(markdown.stdout).toContain("LLM/model called by CodeDecay: no");
  });

  it("includes concrete route/API impacts in agent task bundles", async () => {
    const repo = createNextRouteRiskRepo();

    const json = await run(["agent", "--format", "json"], repo);
    const bundle = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(bundle.summary.impactedRoutes).toBe(2);
    expect(bundle.summary.missingTestFindings).toBeGreaterThan(0);
    expect(bundle.evidence.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"]
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard",
          methods: []
        })
      ])
    );
    expect(bundle.prompt).toContain("2 route/API impacts");
    expect(bundle.prompt).toContain("missing-test findings");
    expect(bundle.prompt).toContain("Start with impacted routes/APIs when present");
    expect(bundle.instructions).toContain(
      "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings."
    );

    const markdown = await run(["agent", "--format", "markdown"], repo);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("| Missing-test findings |");
    expect(markdown.stdout).toContain("Start from impacted routes/APIs when present");
    expect(markdown.stdout).toContain("Impacted routes and APIs:");
    expect(markdown.stdout).toContain("High `GET, POST /api/users` (Next.js API route)");
    expect(markdown.stdout).toContain("Medium `/dashboard` (Next.js UI route)");
  });

  it("includes product verification tasks from latest product artifacts", async () => {
    const repo = createMediumRiskRepo();
    writeLatestProductRunReport(repo);

    const result = await run(["agent", "--profile", "codex", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.agentProfile).toMatchObject({
      id: "codex",
      name: "Codex"
    });
    expect(bundle.summary.productFailureBundles).toBe(1);
    expect(bundle.evidence.productFailureBundles[0]).toMatchObject({
      checkId: "api-get-users",
      checkKind: "api",
      rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
    });
    expect(bundle.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "product-failure",
          title: expect.stringContaining("Fix product failure")
        })
      ])
    );
    expect(bundle.prompt).toContain("1 product failure bundles");
  });

  it("supports agent handoff profiles and rejects invalid profiles", async () => {
    const repo = createMediumRiskRepo();

    const codex = await run(["agent", "--profile", "codex", "--format", "json"], repo);
    const codexBundle = JSON.parse(codex.stdout);

    expect(codex.exitCode).toBe(0);
    expect(codexBundle.agentProfile).toMatchObject({
      id: "codex",
      name: "Codex"
    });
    expect(codexBundle.prompt).toContain("Target agent profile: Codex");

    const cursor = await run(["agent", "--profile=cursor", "--format", "markdown"], repo);

    expect(cursor.exitCode).toBe(0);
    expect(cursor.stdout).toContain("### Agent Handoff");
    expect(cursor.stdout).toContain("Cursor");

    const pi = await run(["agent", "--profile", "pi", "--format", "json"], repo);
    const piBundle = JSON.parse(pi.stdout);

    expect(pi.exitCode).toBe(0);
    expect(piBundle.agentProfile).toMatchObject({
      id: "pi",
      name: "Pi"
    });
    expect(piBundle.prompt).toContain("Target agent profile: Pi");

    const opencode = await run(["agent", "--profile=opencode", "--format", "json"], repo);
    const opencodeBundle = JSON.parse(opencode.stdout);

    expect(opencode.exitCode).toBe(0);
    expect(opencodeBundle.agentProfile).toMatchObject({
      id: "opencode",
      name: "OpenCode"
    });
    expect(opencodeBundle.prompt).toContain("Target agent profile: OpenCode");

    const invalid = await run(["agent", "--profile", "unknown-agent", "--format", "json"], repo);

    expect(invalid.exitCode).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain(
      "CodeDecay failed: Invalid agent profile \"unknown-agent\". Expected generic, codex, claude-code, cursor, pi, opencode, desktop."
    );
  });

  it("uses --cwd and writes relative --output paths from that cwd", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["agent", "--cwd", repo, "--format", "json", "--output", "codedecay-agent.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-agent.json");
    const bundle = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(bundle.mode).toBe("agent-task-bundle");
    expect(bundle.evidence.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(bundle.summary.riskLevel).toBe("medium");
  });

  it("uses base/head refs", async () => {
    const repo = createRepo({
      "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(repo, "src/api/users.ts", "export function handler() { return Response.json({ ok: false }); }\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "change api"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const result = await run(["agent", "--base", base, "--head", head, "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.evidence.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
  });

  it("fails clearly for agent git errors without emitting a bundle", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["agent", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
  });
});

describe("codedecay execute CLI contract", () => {
  it("skips configured commands unless safety.allowCommands is true", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"console.log('should not run')\"",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 1,
      skipped: 1
    });
    expect(report.results[0]).toMatchObject({
      kind: "test",
      status: "skipped",
      stdout: ""
    });
  });

  it("runs configured test, build, start, and probe commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\"",
      buildCommand: "node -e \"console.log('build ok')\"",
      startCommand: "node -e \"console.log('start ok')\"",
      probeCommand: "node -e \"console.log('probe ok')\""
    });

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 4,
      passed: 4
    });
    expect(report.results.map((item: { kind: string }) => item.kind)).toEqual(["test", "build", "start", "probe"]);
    expect(report.results.map((item: { stdout: string }) => item.stdout)).toEqual([
      "test ok\n",
      "build ok\n",
      "start ok\n",
      "probe ok\n"
    ]);
  });

  it("skips configured tool adapters unless safety.allowCommands is true", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  playwright:",
        "    command: node playwright-should-not-run.js",
        "safety:",
        "  allowCommands: false",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );
    writeFile(repo, "playwright-should-not-run.js", "require('fs').writeFileSync('adapter-ran.txt', 'yes');\n");

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 1,
      skipped: 1
    });
    expect(report.results).toEqual([]);
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "playwright",
      command: "node playwright-should-not-run.js",
      status: "skipped"
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "browser-flow",
      severity: "info"
    });
    expect(existsSync(join(repo, "adapter-ran.txt"))).toBe(false);
  });

  it("runs configured tool adapters and returns normalized evidence", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "playwright-pass.js", "console.log('browser flow ok');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  playwright:",
        "    command: node playwright-pass.js",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "playwright",
      command: "node playwright-pass.js",
      status: "passed",
      summary: "Playwright checks passed."
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "browser-flow",
      severity: "info",
      metadata: {
        status: "passed",
        stdout: "browser flow ok"
      }
    });

    const markdown = await run(["execute", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("### Tool Adapter Results");
    expect(markdown.stdout).toContain("Playwright");
    expect(markdown.stdout).toContain("browser-flow");
  });

  it("surfaces StrykerJS survivor evidence from configured mutation reports", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "stryker-pass.js", "console.log('mutation done');\n");
    writeFile(
      repo,
      "reports/mutation/mutation.json",
      JSON.stringify(
        {
          files: {
            "src/math.ts": {
              mutants: [
                {
                  id: "1",
                  status: "Survived",
                  mutatorName: "ArithmeticOperator",
                  location: { start: { line: 4, column: 2 }, end: { line: 4, column: 10 } }
                }
              ]
            }
          }
        },
        null,
        2
      )
    );
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  stryker:",
        "    command: node stryker-pass.js",
        "    reportPath: reports/mutation/mutation.json",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "failed",
      total: 1,
      failed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "stryker",
      status: "failed",
      failure: {
        mode: "no-evidence"
      }
    });
    expect(report.toolAdapters[0].evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mutation",
          severity: "high",
          summary: "Survived ArithmeticOperator mutant in src/math.ts:4.",
          file: "src/math.ts",
          line: 4,
          artifactPath: "reports/mutation/mutation.json"
        })
      ])
    );
  });

  it("returns exit 1 and reports failures from configured tool adapters", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "pact-fail.js", "console.error('contract mismatch'); process.exit(15);\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  pact:",
        "    command: node pact-fail.js",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "failed",
      total: 1,
      failed: 1
    });
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "pact",
      command: "node pact-fail.js",
      status: "failed",
      failure: {
        mode: "nonzero-exit"
      }
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "contract",
      severity: "high"
    });
  });

  it("returns exit 1 and reports failures from configured commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\"",
      probeCommand: "node -e \"console.error('probe failed'); process.exit(3)\""
    });

    const result = await run(["execute", "--format", "markdown"], repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("## CodeDecay Execution Report");
    expect(result.stdout).toContain("**Overall status:** Failed");
    expect(result.stdout).toContain("Exit code: 3");
    expect(result.stdout).toContain("probe failed");
  });

  it("writes execution reports to relative --output paths from --cwd", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\""
    });

    const result = await run(["execute", "--cwd", repo, "--format", "json", "--output", "codedecay-execute.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-execute.json");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });
});

describe("codedecay product CLI contract", () => {
  it("prints a skipped report when no product targets are configured", async () => {
    const cwd = createTempDir();

    const result = await run(["product", "--format", "json"], cwd);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 0,
      skipped: 0
    });
    expect(report.targets).toEqual([]);
    expect(report.safety).toMatchObject({
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("health-checks an already running product target without executing commands", async () => {
    const server = await startHealthServer();
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    web:",
        `      baseUrl: ${server.origin}`,
        `      healthCheck: ${server.healthUrl}`,
        "      timeoutMs: 1000",
        ""
      ].join("\n")
    );

    try {
      const result = await run(["product", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.summary).toMatchObject({
        status: "passed",
        total: 1,
        passed: 1
      });
      expect(report.targets[0]).toMatchObject({
        id: "web",
        status: "passed",
        baseUrl: server.origin,
        healthCheck: server.healthUrl,
        health: {
          status: "passed",
          httpStatus: 204
        }
      });
      expect(report.safety.commandsExecuted).toBe(false);

      const markdown = await run(["product", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(0);
      expect(markdown.stdout).toContain("## CodeDecay Product Target Report");
      expect(markdown.stdout).toContain("**web** Passed");
      expect(markdown.stdout).toContain("Commands executed: no");
    } finally {
      await server.close();
    }
  });

  it("blocks startup commands unless safety.allowCommands is explicitly enabled", async () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "blocked-start.mjs", "import { writeFileSync } from 'node:fs';\nwriteFileSync('should-not-exist.txt', 'ran');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    web:",
        `      startCommand: ${JSON.stringify(`${process.execPath} blocked-start.mjs`)}`,
        "      healthCheck: http://127.0.0.1:9/health",
        "      timeoutMs: 1000",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    );

    const result = await run(["product", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "blocked",
      total: 1,
      blocked: 1
    });
    expect(report.targets[0]).toMatchObject({
      id: "web",
      status: "blocked",
      start: {
        status: "blocked",
        blockedReason: "safety.allowCommands is false"
      }
    });
    expect(report.safety.commandsExecuted).toBe(false);
    expect(existsSync(join(repo, "should-not-exist.txt"))).toBe(false);
  });

  it("starts, health-checks, stops, and tears down an allowed local product target", async () => {
    const repo = createLowRiskRepo();
    const port = await getFreePort();
    writeFile(
      repo,
      "product-server.mjs",
      [
        "import { createServer } from 'node:http';",
        "import { writeFileSync } from 'node:fs';",
        "const port = Number(process.argv[2]);",
        "writeFileSync('started.txt', 'yes');",
        "const server = createServer((request, response) => {",
        "  if (request.url === '/health') {",
        "    response.writeHead(200);",
        "    response.end('ok');",
        "    return;",
        "  }",
        "  response.writeHead(404);",
        "  response.end('not found');",
        "});",
        "server.listen(port, '127.0.0.1');",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        ""
      ].join("\n")
    );
    writeFile(repo, "teardown.mjs", "import { writeFileSync } from 'node:fs';\nwriteFileSync('teardown.txt', 'yes');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    web:",
        `      startCommand: ${JSON.stringify(`${process.execPath} product-server.mjs ${port}`)}`,
        `      healthCheck: http://127.0.0.1:${port}/health`,
        `      teardownCommand: ${JSON.stringify(`${process.execPath} teardown.mjs`)}`,
        "      timeoutMs: 3000",
        "safety:",
        "  allowCommands: true",
        ""
      ].join("\n")
    );

    const result = await run(["product", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.targets[0]).toMatchObject({
      id: "web",
      status: "passed",
      start: {
        status: "started"
      },
      health: {
        status: "passed",
        httpStatus: 200
      },
      teardown: {
        status: "passed"
      }
    });
    expect(report.safety.commandsExecuted).toBe(true);
    expect(readFileSync(join(repo, "started.txt"), "utf8")).toBe("yes");
    expect(readFileSync(join(repo, "teardown.txt"), "utf8")).toBe("yes");
  });

  it("refuses product exploration without configured targets", async () => {
    const cwd = createTempDir();

    const result = await run(["product", "--explore", "--format", "json"], cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("codedecay product execution workflows require at least one configured productTesting target.");
  });

  it("blocks product exploration until explicit command safety is enabled", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: false
    });

    try {
      const result = await run(["product", "--explore", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(report.summary.status).toBe("blocked");
      expect(report.targets[0]).toMatchObject({
        status: "blocked",
        exploration: {
          status: "blocked",
          driver: "playwright",
          error: "Product exploration requires safety.allowCommands to be true."
        }
      });
      expect(existsSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("reports missing project Playwright without installing packages or browsers", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(report.targets[0]).toMatchObject({
        status: "blocked",
        exploration: {
          status: "blocked",
          driver: "playwright"
        }
      });
      expect(report.targets[0].exploration.error).toContain("Playwright is not installed or cannot be loaded");
      expect(existsSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("uses project Playwright to crawl same-origin flows and write a flow-map artifact", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const artifactPath = join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json");
      const flowMap = JSON.parse(readFileSync(artifactPath, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.summary.status).toBe("passed");
      expect(report.targets[0].exploration).toMatchObject({
        status: "passed",
        driver: "playwright",
        artifactPath: ".codedecay/local/product-flow-maps/web/flow-map.json",
        pages: 2
      });
      expect(report.safety.browserAutomationRan).toBe(true);
      expect(flowMap).toMatchObject({
        schemaVersion: 1,
        target: {
          id: "web",
          baseUrl: server.origin,
          origin: server.origin
        },
        limits: {
          sameOrigin: true,
          maxPages: 5,
          allowDestructiveActions: false
        },
        summary: {
          pages: 2,
          blockedActions: expect.any(Number)
        }
      });
      expect(flowMap.pages.map((page: { path: string }) => page.path)).toEqual(["/", "/settings"]);
      expect(flowMap.pages[0].links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            href: `${server.origin}/settings`,
            sameOrigin: true,
            discovered: true
          }),
          expect.objectContaining({
            href: "https://example.com",
            sameOrigin: false,
            discovered: false
          })
        ])
      );
      expect(flowMap.blockedActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Delete user"
          })
        ])
      );

      const markdown = await run(["product", "--explore", "--max-pages", "1", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(0);
      expect(markdown.stdout).toContain("Flow map: `.codedecay/local/product-flow-maps/web/flow-map.json`");
      expect(markdown.stdout).toContain("Browser automation ran: yes");
    } finally {
      await server.close();
    }
  });

  it("honors product explorer max-page limits and destructive-action opt-in", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(
        ["product", "--explore", "--max-pages", "1", "--allow-destructive-actions", "--format", "json"],
        repo
      );
      const report = JSON.parse(result.stdout);
      const flowMap = JSON.parse(readFileSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].exploration).toMatchObject({
        pages: 1,
        blockedActions: 0
      });
      expect(flowMap.pages).toHaveLength(1);
      expect(flowMap.pages.map((page: { path: string }) => page.path)).toEqual(["/"]);
      expect(flowMap.summary.blockedActions).toBe(0);
      expect(flowMap.pages[0].interactiveElements.some((element: { destructive: boolean; blocked: boolean }) => element.destructive && !element.blocked)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("honors product explorer max-action limits", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--max-pages", "1", "--max-actions", "1", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const flowMap = JSON.parse(readFileSync(join(repo, ".codedecay/local/product-flow-maps/web/flow-map.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].exploration).toMatchObject({
        interactiveElements: 1
      });
      expect(report.targets[0].exploration.skippedActions).toBeGreaterThan(0);
      expect(flowMap.summary).toMatchObject({
        interactiveElements: 1
      });
      expect(flowMap.summary.skippedActions).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("generates reviewable Playwright tests from a product flow map", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const sourcePath = join(repo, ".codedecay/local/generated-tests/web/product.generated.spec.ts");
      const manifestPath = join(repo, ".codedecay/local/generated-tests/web/manifest.json");
      const source = readFileSync(sourcePath, "utf8");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTests).toMatchObject({
        status: "passed",
        sourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts",
        manifestPath: ".codedecay/local/generated-tests/web/manifest.json"
      });
      expect(report.targets[0].generatedTests.tests.length).toBeGreaterThanOrEqual(3);
      expect(report.safety.generatedTestsRan).toBe(false);
      expect(source).toContain("@generated by CodeDecay");
      expect(source).toContain("getByRole('link'");
      expect(source).toContain("getByLabel");
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        reviewRequired: true,
        sourceFlowMapPath: ".codedecay/local/product-flow-maps/web/flow-map.json",
        testSourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts"
      });
      expect(manifest.tests.length).toBeGreaterThanOrEqual(3);
      expect(existsSync(join(repo, "tests/e2e/codedecay-product.spec.ts"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("runs generated Playwright tests through the project-local Playwright CLI", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--run-generated-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTestRun).toMatchObject({
        status: "passed",
        failed: 0,
        skipped: 0
      });
      expect(report.targets[0].generatedTestRun.passed).toBeGreaterThanOrEqual(3);
      expect(report.targets[0].generatedTestRun.command).toContain("node_modules/playwright/cli.js");
      expect(report.safety.generatedTestsRan).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("runs reviewed generated tests without overwriting local edits", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const generated = await run(["product", "--explore", "--generate-tests", "--max-pages", "5", "--format", "json"], repo);
      expect(generated.exitCode).toBe(0);

      const sourcePath = ".codedecay/local/generated-tests/web/product.generated.spec.ts";
      const reviewedSource = `${readFileSync(join(repo, sourcePath), "utf8")}\n// reviewed local edit\n`;
      writeFile(repo, sourcePath, reviewedSource);

      const result = await run(["product", "--run-generated-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTests.notes).toContain("Loaded existing generated tests without regenerating source.");
      expect(readFileSync(join(repo, sourcePath), "utf8")).toContain("// reviewed local edit");
    } finally {
      await server.close();
    }
  });

  it("reruns a single generated test by test id", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const generated = await run(["product", "--explore", "--generate-tests", "--max-pages", "5", "--format", "json"], repo);
      expect(generated.exitCode).toBe(0);
      const generatedReport = JSON.parse(generated.stdout);
      const testId = generatedReport.targets[0].generatedTests.tests[0].id;

      const result = await run(["product", "--run-generated-tests", "--test-id", testId, "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedTestRun).toMatchObject({
        status: "passed",
        passed: 1,
        failed: 0
      });
      expect(report.targets[0].generatedTestRun.command).toContain("--grep");
    } finally {
      await server.close();
    }
  });

  it("reports generated test failures with source, failing step, and rerun command", async () => {
    const server = await startDemoAppServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeFile(repo, "fail-generated-tests.txt", "yes\n");
    writeProductTargetConfig(repo, {
      baseUrl: server.origin,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--explore", "--generate-tests", "--run-generated-tests", "--max-pages", "5", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const failure = report.targets[0].generatedTestRun.failures[0];

      expect(result.exitCode).toBe(1);
      expect(report.targets[0].status).toBe("failed");
      expect(report.targets[0].generatedTestRun).toMatchObject({
        status: "failed",
        failed: 1
      });
      expect(failure).toMatchObject({
        failingStep: expect.stringContaining("Run generated test"),
        testSourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts"
      });
      expect(failure.rerunCommand).toContain("npx codedecay product --target web --run-generated-tests --test-id ");
      expect(failure.rerunCommand).toContain(" --format markdown");
      expect(failure.error).toContain("Forced generated test failure");
      expect(failure.testSource).toContain("@generated by CodeDecay");
      expect(failure.testSource).toContain("test.describe");

      const markdown = await run(["product", "--generate-tests", "--run-generated-tests", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(1);
      expect(markdown.stdout).toContain("Failing step:");
      expect(markdown.stdout).toContain("Rerun: `npx codedecay product --target web --run-generated-tests --test-id ");
      expect(markdown.stdout).toContain("```ts");
      expect(markdown.stdout).toContain("@generated by CodeDecay");
    } finally {
      await server.close();
    }
  });

  it("generates reviewable API tests from a configured OpenAPI schema", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: false
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const sourcePath = join(repo, ".codedecay/local/generated-api-tests/api/api.generated.spec.ts");
      const manifestPath = join(repo, ".codedecay/local/generated-api-tests/api/manifest.json");
      const source = readFileSync(sourcePath, "utf8");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedApiTests).toMatchObject({
        status: "passed",
        sourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
        manifestPath: ".codedecay/local/generated-api-tests/api/manifest.json"
      });
      expect(report.targets[0].generatedApiTests.tests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "api-operation",
            method: "GET",
            operationPath: "/api/users",
            expectedStatuses: [200, 401]
          }),
          expect.objectContaining({
            method: "POST",
            destructive: true
          })
        ])
      );
      expect(source).toContain("@generated by CodeDecay");
      expect(source).toContain("CodeDecay generated API regression tests");
      expect(source).toContain('test.skip("POST /api/users returns a documented status"');
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        reviewRequired: true,
        sourceOpenApiSchemaPath: "docs/openapi.yaml",
        testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
        promoteByCopyingTo: "tests/api/codedecay-api.spec.ts"
      });
      expect(existsSync(join(repo, "tests/api/codedecay-api.spec.ts"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("prioritizes generated product checks from repo memory", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: false
    });
    writeFile(
      repo,
      ".codedecay/memory.json",
      JSON.stringify(
        {
          version: 1,
          flows: [
            {
              name: "User detail flow",
              files: ["README.md"],
              productPaths: ["/api/users/{id}"],
              checks: ["user detail stays readable after docs-linked changes"]
            }
          ],
          regressions: [
            {
              title: "Users list 500",
              description: "A previous generated product check caught a users list 500.",
              areas: ["api"],
              productPaths: ["/api/users"],
              severity: "high"
            }
          ]
        },
        null,
        2
      )
    );

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const tests = report.targets[0].generatedApiTests.tests;

      expect(result.exitCode).toBe(0);
      expect(tests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            operationPath: "/api/users",
            priority: "high"
          }),
          expect.objectContaining({
            method: "GET",
            operationPath: "/api/users/1",
            priority: "high"
          })
        ])
      );
    } finally {
      await server.close();
    }
  });

  it("generates API tests from manually configured endpoint lists", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    writeManualApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: false
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const source = readFileSync(join(repo, ".codedecay/local/generated-api-tests/api/api.generated.spec.ts"), "utf8");
      const manifest = JSON.parse(readFileSync(join(repo, ".codedecay/local/generated-api-tests/api/manifest.json"), "utf8"));

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedApiTests.tests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "list-users",
            method: "GET",
            operationPath: "/api/users",
            expectedStatuses: [200]
          }),
          expect.objectContaining({
            method: "POST",
            requestBody: {
              email: "codedecay@example.com"
            },
            destructive: true
          })
        ])
      );
      expect(source).toContain("x-codedecay-scenario");
      expect(source).toContain("codedecay@example.com");
      expect(manifest).toMatchObject({
        sourceApiEndpoints: "productTesting.targets.api.apiEndpoints",
        testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts"
      });
    } finally {
      await server.close();
    }
  });

  it("runs generated API tests through the project-local Playwright CLI", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(report.targets[0].generatedApiTestRun).toMatchObject({
        status: "passed",
        failed: 0
      });
      expect(report.targets[0].generatedApiTestRun.passed).toBeGreaterThanOrEqual(2);
      expect(report.targets[0].generatedApiTestRun.command).toContain("node_modules/playwright/cli.js");
      expect(report.safety.generatedTestsRan).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("reports generated API test failures with request evidence and rerun command", async () => {
    const server = await startDemoApiServer();
    const repo = createLowRiskRepo();
    installFakePlaywright(repo);
    writeFile(repo, "fail-generated-tests.txt", "yes\n");
    writeDemoOpenApiSchema(repo);
    writeApiProductTargetConfig(repo, {
      baseUrl: server.origin,
      healthCheck: server.healthUrl,
      allowCommands: true
    });

    try {
      const result = await run(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests", "--format", "json"], repo);
      const report = JSON.parse(result.stdout);
      const failure = report.targets[0].generatedApiTestRun.failures[0];

      expect(result.exitCode).toBe(1);
      expect(report.targets[0].status).toBe("failed");
      expect(failure).toMatchObject({
        testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
        request: {
          method: "GET"
        }
      });
      expect(failure.rerunCommand).toContain("npx codedecay product --target api --run-generated-api-tests --test-id ");
      expect(failure.rerunCommand).toContain(" --format markdown");
      expect(failure.request.url).toContain(`${server.origin}/api/users`);
      expect(failure.expected).toContain("documented statuses");
      expect(failure.actual).toContain("Forced generated test failure");
      expect(failure.impactedFiles).toContain("README.md");

      const markdown = await run(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests", "--format", "markdown"], repo);
      expect(markdown.exitCode).toBe(1);
      expect(markdown.stdout).toContain("API failure:");
      expect(markdown.stdout).toContain(`Request: GET \`${failure.request.url}\``);
      expect(markdown.stdout).toContain("Rerun: `npx codedecay product --target api --run-generated-api-tests --test-id ");
    } finally {
      await server.close();
    }
  });

  it("fails clearly when a requested product target is unknown", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      ["version: 1", "productTesting:", "  targets:", "    web:", "      baseUrl: http://127.0.0.1:3000", ""].join("\n")
    );

    const result = await run(["product", "--target", "mobile", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Unknown product target "mobile". Available targets: web.');
  });
});

describe("codedecay differential CLI contract", () => {
  it("reports changed structured probe output between base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "changed",
      total: 1,
      changed: 1
    });
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: ["structured stdout changed"],
      base: {
        status: "passed",
        structuredOutput: { value: "base" }
      },
      head: {
        status: "passed",
        structuredOutput: { value: "head" }
      }
    });
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-base-");
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-head-");
  });

  it("passes when configured probes behave the same on base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Differential Report");
    expect(result.stdout).toContain("**Overall status:** Passed");
  });

  it("skips differential probes when command execution is disabled", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: false });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary.status).toBe("skipped");
    expect(report.results[0].status).toBe("skipped");
  });

  it("writes differential reports to relative --output paths from --cwd", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });
    const outsideCwd = createTempDir();

    const result = await run(
      ["differential", "--cwd", repo, "--base", base, "--head", head, "--format", "json", "--output", "codedecay-diff.json"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay-diff.json");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });

  it("fails clearly when differential refs are missing", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["differential", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("codedecay differential requires --base <ref> and --head <ref>.");
  });
});

async function expectExit(args: string[], cwd: string, expectedExitCode: number): Promise<void> {
  const result = await run(args, cwd);
  expect(result.exitCode).toBe(expectedExitCode);
}

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

function stableReport(output: string): unknown {
  const report = JSON.parse(output);
  delete report.generatedAt;
  return report;
}

async function startHealthServer(): Promise<HealthServer> {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test health server.");
  }

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    healthUrl: `${origin}/health`,
    close: async () => {
      await closeServer(server);
    }
  };
}

async function startDemoAppServer(): Promise<DemoAppServer> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    response.setHeader("content-type", "text/html; charset=utf-8");

    if (url === "/" || url === "") {
      response.end(
        [
          "<!doctype html>",
          "<html>",
          "<head><title>Demo Home</title></head>",
          "<body>",
          '<a href="/settings">Settings</a>',
          '<a href="https://example.com">External</a>',
          '<form method="post" action="/users/delete" aria-label="Delete user">',
          '<button type="submit">Delete user</button>',
          "</form>",
          "</body>",
          "</html>"
        ].join("")
      );
      return;
    }

    if (url === "/settings") {
      response.end(
        [
          "<!doctype html>",
          "<html>",
          "<head><title>Settings</title></head>",
          "<body>",
          '<a href="/">Home</a>',
          '<label>Email <input name="email" placeholder="Email address"></label>',
          '<button type="button">Preview settings</button>',
          "</body>",
          "</html>"
        ].join("")
      );
      return;
    }

    response.writeHead(404);
    response.end("<title>Not found</title>");
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind demo app server.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await closeServer(server);
    }
  };
}

async function startDemoApiServer(): Promise<HealthServer> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";

    if (url === "/health") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (url === "/api/users") {
      response.setHeader("content-type", "application/json");
      if (request.method === "POST") {
        response.writeHead(201);
        response.end(JSON.stringify({ id: "created" }));
        return;
      }

      response.writeHead(200);
      response.end(JSON.stringify([{ id: 1, email: "codedecay@example.com" }]));
      return;
    }

    if (url === "/api/users/1") {
      response.setHeader("content-type", "application/json");
      response.writeHead(200);
      response.end(JSON.stringify({ id: 1, email: "codedecay@example.com" }));
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind demo API server.");
  }

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    healthUrl: `${origin}/health`,
    close: async () => {
      await closeServer(server);
    }
  };
}

function installFakePlaywright(repo: string): void {
  writeFile(
    repo,
    "node_modules/playwright/index.js",
    [
      "const { writeFileSync } = require('node:fs');",
      "function titleFrom(html) {",
      "  const match = /<title[^>]*>([\\s\\S]*?)<\\/title>/i.exec(html);",
      "  return match ? match[1].replace(/\\s+/g, ' ').trim() : '';",
      "}",
      "exports.chromium = {",
      "  async launch() {",
      "    return {",
      "      async newPage() {",
      "        let currentUrl = '';",
      "        let currentHtml = '';",
      "        return {",
      "          async goto(url) {",
      "            const response = await fetch(url);",
      "            currentUrl = response.url.replace(/\\/$/, '');",
      "            currentHtml = await response.text();",
      "          },",
      "          async content() { return currentHtml; },",
      "          async title() { return titleFrom(currentHtml); },",
      "          url() { return currentUrl; },",
      "          async screenshot(options) { writeFileSync(options.path, 'fake screenshot'); },",
      "          async close() {}",
      "        };",
      "      },",
      "      async close() {}",
      "    };",
      "  }",
      "};",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "node_modules/playwright/cli.js",
    [
      "const { existsSync, readFileSync } = require('node:fs');",
      "const sourcePath = process.argv.find((arg) => arg.endsWith('.spec.ts'));",
      "const source = sourcePath ? readFileSync(sourcePath, 'utf8') : '';",
      "const grepIndex = process.argv.indexOf('--grep');",
      "const grep = grepIndex === -1 ? undefined : new RegExp(process.argv[grepIndex + 1]);",
      "const titles = Array.from(source.matchAll(/test\\((['\"])(.*?)\\1/g)).map((match) => match[2]).filter(Boolean).filter((title) => !grep || grep.test(title));",
      "const forceFail = existsSync('fail-generated-tests.txt');",
      "const specs = titles.map((title, index) => ({",
      "  title,",
      "  tests: [{",
      "    status: forceFail && index === 0 ? 'failed' : 'passed',",
      "    results: [{",
      "      status: forceFail && index === 0 ? 'failed' : 'passed',",
      "      error: forceFail && index === 0 ? { message: 'Forced generated test failure' } : undefined",
      "    }]",
      "  }]",
      "}));",
      "console.log(JSON.stringify({ suites: [{ title: 'generated', specs }] }));",
      "process.exit(forceFail ? 1 : 0);",
      ""
    ].join("\n")
  );
}

function writeProductTargetConfig(repo: string, input: { baseUrl: string; allowCommands: boolean }): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "productTesting:",
      "  targets:",
      "    web:",
      `      baseUrl: ${input.baseUrl}`,
      "      timeoutMs: 2000",
      "safety:",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  );
}

function writeApiProductTargetConfig(repo: string, input: { baseUrl: string; healthCheck: string; allowCommands: boolean }): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "toolAdapters:",
      "  schemathesis:",
      "    schema: docs/openapi.yaml",
      `    baseUrl: ${input.baseUrl}`,
      "productTesting:",
      "  targets:",
      "    api:",
      `      baseUrl: ${input.baseUrl}`,
      `      healthCheck: ${input.healthCheck}`,
      "      timeoutMs: 2000",
      "safety:",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  );
}

function writeManualApiProductTargetConfig(repo: string, input: { baseUrl: string; healthCheck: string; allowCommands: boolean }): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "productTesting:",
      "  targets:",
      "    api:",
      `      baseUrl: ${input.baseUrl}`,
      `      healthCheck: ${input.healthCheck}`,
      "      timeoutMs: 2000",
      "      apiEndpoints:",
      "        - id: list-users",
      "          method: GET",
      "          path: /api/users",
      "          expectedStatuses: [200]",
      "          headers:",
      "            x-codedecay-scenario: list-users",
      "        - method: POST",
      "          path: /api/users",
      "          expectedStatuses: [201, 400]",
      "          body:",
      "            email: codedecay@example.com",
      "safety:",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  );
}

function writeDemoOpenApiSchema(repo: string): void {
  writeFile(
    repo,
    "docs/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Demo API",
      "  version: 1.0.0",
      "paths:",
      "  /api/users:",
      "    get:",
      "      operationId: listUsers",
      "      responses:",
      "        '200':",
      "          description: users returned",
      "        '401':",
      "          description: auth required",
      "    post:",
      "      operationId: createUser",
      "      requestBody:",
      "        required: true",
      "        content:",
      "          application/json:",
      "            schema:",
      "              type: object",
      "              required: [email]",
      "              properties:",
      "                email:",
      "                  type: string",
      "                  format: email",
      "      responses:",
      "        '201':",
      "          description: created",
      "        '400':",
      "          description: bad request",
      "  /api/users/{id}:",
      "    get:",
      "      operationId: getUser",
      "      parameters:",
      "        - name: id",
      "          in: path",
      "          required: true",
      "          schema:",
      "            type: integer",
      "      responses:",
      "        '200':",
      "          description: user returned",
      "        '404':",
      "          description: missing user",
      ""
    ].join("\n")
  );
}

function writeLatestProductRunReport(repo: string): void {
  writeFile(
    repo,
    ".codedecay/local/product-runs/latest.json",
    JSON.stringify(
      {
        tool: "CodeDecay",
        version: "0.3.0",
        summary: {
          status: "failed"
        },
        targets: [
          {
            id: "api",
            status: "failed",
            baseUrl: "http://127.0.0.1:3000",
            generatedApiTestRun: {
              status: "failed",
              failures: [
                {
                  testId: "api-get-users",
                  title: "GET /api/users returns a documented status",
                  failingStep: "Run generated test.",
                  error: "Expected documented status 200 but got 500.",
                  request: {
                    method: "GET",
                    url: "http://127.0.0.1:3000/api/users"
                  },
                  expected: "GET /api/users should return one of the documented statuses 200.",
                  actual: "Expected documented status 200 but got 500.",
                  impactedFiles: ["src/api/users.ts"],
                  testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
                  rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
                }
              ]
            }
          }
        ],
        safety: {
          telemetrySent: false,
          cloudDependency: false
        }
      },
      null,
      2
    )
  );
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to reserve a free port.");
  }

  const port = address.port;
  await closeServer(server);
  return port;
}

async function listenOnLoopback(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };

    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function currentCliVersion(): string {
  const packageJsonPath = join(process.cwd(), "packages/cli/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}

function createLowRiskRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });

  writeFile(repo, "README.md", "# Project\nDocs change.\n");
  return repo;
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

function createNextRouteRiskRepo(): string {
  const repo = createRepo({
    "src/app/api/users/route.ts": "export async function GET() { return Response.json([]); }\n",
    "src/app/dashboard/page.tsx": "export default function Page() { return <main />; }\n"
  });

  writeFile(
    repo,
    "src/app/api/users/route.ts",
    [
      "export async function GET() {",
      "  return Response.json([]);",
      "}",
      "export async function POST() {",
      "  return Response.json({ ok: true });",
      "}",
      ""
    ].join("\n")
  );
  writeFile(repo, "src/app/dashboard/page.tsx", "export default function Page() { return <main>Changed</main>; }\n");

  return repo;
}

function createDifferentialRepo(input: { headValue: string; allowCommands: boolean }): {
  repo: string;
  base: string;
  head: string;
} {
  const repo = createRepo({
    "probe.js": [
      "const { readFileSync } = require('node:fs');",
      "const value = readFileSync('value.txt', 'utf8').trim();",
      "console.log(JSON.stringify({ value }));",
      ""
    ].join("\n"),
    "value.txt": "base\n",
    ".codedecay/config.yml": [
      "version: 1",
      "commands: {}",
      "probes:",
      "  - name: value probe",
      "    command: node probe.js",
      "    timeoutMs: 1000",
      "safety:",
      "  commandTimeoutMs: 1000",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  if (input.headValue === "base") {
    writeFile(repo, "README.md", "# Fixture\nDocs-only head change.\n");
  } else {
    writeFile(repo, "value.txt", `${input.headValue}\n`);
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "update value"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
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
  const root = mkTempRoot();
  tempRoots.push(root);
  return root;
}

function mkTempRoot(): string {
  return execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-XXXXXX")], {
    encoding: "utf8"
  }).trim();
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function writeExecutionConfig(
  repo: string,
  input: {
    allowCommands: boolean;
    testCommand?: string | undefined;
    buildCommand?: string | undefined;
    startCommand?: string | undefined;
    probeCommand?: string | undefined;
    toolAdapters?: boolean | undefined;
  }
): void {
  const lines = ["version: 1"];
  const commands = [
    ["test", input.testCommand],
    ["build", input.buildCommand],
    ["start", input.startCommand]
  ] as const;

  if (commands.some(([, command]) => command)) {
    lines.push("commands:");
    for (const [name, command] of commands) {
      appendCommand(lines, name, command);
    }
  } else {
    lines.push("commands: {}");
  }

  if (input.probeCommand) {
    lines.push("probes:");
    lines.push("  - name: smoke probe", `    command: ${input.probeCommand}`, "    timeoutMs: 1000");
  } else {
    lines.push("probes: []");
  }

  if (input.toolAdapters) {
    lines.push(
      "toolAdapters:",
      "  playwright: true",
      "  schemathesis:",
      "    schema: docs/openapi.yaml",
      "    baseUrl: http://127.0.0.1:4000"
    );
  }

  lines.push("safety:", "  commandTimeoutMs: 1000", `  allowCommands: ${input.allowCommands}`, "");
  writeFile(repo, ".codedecay/config.yml", lines.join("\n"));
}

function appendCommand(lines: string[], name: "test" | "build" | "start", command: string | undefined): void {
  if (command) {
    lines.push(`  ${name}:`);
    lines.push(`    - ${command}`);
  }
}

function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}

function gitOutput(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}
