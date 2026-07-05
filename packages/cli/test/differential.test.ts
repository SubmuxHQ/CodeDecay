import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDifferentialRepo, createLowRiskRepo, createRepo, createTempDir, git, gitOutput, run, writeFile } from "./helpers";

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
      differences: ['structured stdout changed at value: "base" -> "head"'],
      rerunCommand: `npx codedecay differential --base ${base} --head ${head} --format markdown`,
      base: {
        status: "passed",
        structuredOutput: { value: "base" }
      },
      head: {
        status: "passed",
        structuredOutput: { value: "head" }
      }
    });
    expect(report.results[0].artifacts.directory).toContain(".codedecay/local/differential/");
    expect(existsSync(join(repo, report.results[0].artifacts.baseResult))).toBe(true);
    expect(existsSync(join(repo, report.results[0].artifacts.headResult))).toBe(true);
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-base-");
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-head-");
  });

  it("reports changed HTTP-style JSON status, body, and schema fields", async () => {
    const { repo, base, head } = createHttpProbeDifferentialRepo();

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: [
        "structured stdout changed at body.ok: true -> false",
        'structured stdout changed at schema.fields: ["id"] -> ["id","error"]',
        "structured stdout changed at status: 200 -> 500"
      ]
    });
  });

  it("reports changed CLI probe exit code between base and head", async () => {
    const { repo, base, head } = createExitCodeDifferentialRepo();

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: ["status changed from passed to failed", "exit code changed from 0 to 2"],
      base: {
        status: "passed",
        exitCode: 0
      },
      head: {
        status: "failed",
        exitCode: 2
      }
    });
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

  it("fails clearly when differential refs are invalid", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["differential", "--base", "missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('Could not resolve git ref "missing-ref".');
  });

  it("reports removed OpenAPI paths as breaking API contract changes", async () => {
    const { repo, base, head } = createApiContractDifferentialRepo({
      basePaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id"])
        }
      },
      headPaths: {}
    });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "changed",
      total: 1,
      apiContracts: {
        total: 1,
        changed: 1,
        breakingChanges: 1
      }
    });
    expect(report.apiContracts[0]).toMatchObject({
      schemaPath: "docs/openapi.json",
      status: "changed",
      breakingChanges: [
        expect.objectContaining({
          kind: "removed-path",
          path: "/users"
        })
      ]
    });
    expect(report.results).toEqual([]);
  });

  it("keeps added OpenAPI paths as non-breaking API contract additions", async () => {
    const { repo, base, head } = createApiContractDifferentialRepo({
      basePaths: {},
      headPaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id"])
        }
      }
    });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      apiContracts: {
        total: 1,
        passed: 1,
        nonBreakingChanges: 1
      }
    });
    expect(report.apiContracts[0]).toMatchObject({
      status: "passed",
      breakingChanges: [],
      nonBreakingChanges: [
        expect.objectContaining({
          kind: "added-path",
          path: "/users"
        })
      ]
    });
  });

  it("reports removed OpenAPI response status codes and fields as breaking", async () => {
    const { repo, base, head } = createApiContractDifferentialRepo({
      basePaths: {
        "/users": {
          get: {
            responses: {
              "200": jsonResponse(["id", "email"], ["id", "email"]),
              "404": jsonResponse(["error"], ["error"])
            }
          }
        }
      },
      headPaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id"])
        }
      }
    });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);
    const kinds = report.apiContracts[0].breakingChanges.map((change: { kind: string }) => change.kind);

    expect(result.exitCode).toBe(1);
    expect(kinds).toEqual(expect.arrayContaining(["removed-status-code", "removed-response-field"]));
  });

  it("keeps optional OpenAPI response field additions non-breaking", async () => {
    const { repo, base, head } = createApiContractDifferentialRepo({
      basePaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id"])
        }
      },
      headPaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id", "nickname"])
        }
      }
    });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.apiContracts[0]).toMatchObject({
      status: "passed",
      breakingChanges: [],
      nonBreakingChanges: [
        expect.objectContaining({
          kind: "added-response-field",
          path: "/users",
          method: "GET",
          statusCode: "200"
        })
      ]
    });
  });

  it("reports response fields that become optional as breaking requiredness changes", async () => {
    const { repo, base, head } = createApiContractDifferentialRepo({
      basePaths: {
        "/users": {
          get: jsonGetOperation(["id", "email"], ["id", "email"])
        }
      },
      headPaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id", "email"])
        }
      }
    });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.apiContracts[0].breakingChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "response-required-field-removed",
          schemaPath: "paths./users.get.responses.200.content.application/json.schema.properties.email"
        })
      ])
    );
  });

  it("reports added required OpenAPI request parameters as breaking", async () => {
    const { repo, base, head } = createApiContractDifferentialRepo({
      basePaths: {
        "/users": {
          get: jsonGetOperation(["id"], ["id"])
        }
      },
      headPaths: {
        "/users": {
          get: {
            ...jsonGetOperation(["id"], ["id"]),
            parameters: [
              {
                name: "tenantId",
                in: "query",
                required: true,
                schema: { type: "string" }
              }
            ]
          }
        }
      }
    });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.apiContracts[0].breakingChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "required-request-parameter-added",
          path: "/users",
          method: "GET"
        })
      ])
    );
  });

  it("fails safely when an OpenAPI schema path resolves outside the worktree", async () => {
    const { repo, base, head } = createMissingApiContractDifferentialRepo("../openapi.yaml");

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary.status).toBe("failed");
    expect(report.apiContracts[0]).toMatchObject({
      status: "failed",
      errors: [
        "../openapi.yaml resolves outside the worktree.",
        "../openapi.yaml resolves outside the worktree."
      ]
    });
  });
});

function createHttpProbeDifferentialRepo(): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "probe.js": "console.log(require('fs').readFileSync('response.json', 'utf8'));\n",
    "response.json": `${JSON.stringify({ status: 200, body: { ok: true }, schema: { fields: ["id"] } })}\n`,
    ".codedecay/config.yml": differentialProbeConfig(true)
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "response.json", `${JSON.stringify({ status: 500, body: { ok: false }, schema: { fields: ["id", "error"] } })}\n`);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "change response"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function createExitCodeDifferentialRepo(): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "probe.js": "process.exit(Number(require('fs').readFileSync('exit-code.txt', 'utf8').trim()));\n",
    "exit-code.txt": "0\n",
    ".codedecay/config.yml": differentialProbeConfig(true)
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "exit-code.txt", "2\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "change exit code"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function createApiContractDifferentialRepo(input: {
  basePaths: Record<string, unknown>;
  headPaths: Record<string, unknown>;
}): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "docs/openapi.json": openApiDocument(input.basePaths),
    ".codedecay/config.yml": apiContractConfig("docs/openapi.json")
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "docs/openapi.json", openApiDocument(input.headPaths));
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "update api contract"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function createMissingApiContractDifferentialRepo(schemaPath: string): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "README.md": "# Fixture\n",
    ".codedecay/config.yml": apiContractConfig(schemaPath)
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "README.md", "# Fixture\n\nHead change.\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "update readme"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function apiContractConfig(schemaPath: string): string {
  return [
    "version: 1",
    "commands: {}",
    "apiContracts:",
    "  openapi:",
    `    - ${schemaPath}`,
    "safety:",
    "  allowCommands: false",
    ""
  ].join("\n");
}

function openApiDocument(paths: Record<string, unknown>): string {
  return `${JSON.stringify({
    openapi: "3.0.0",
    info: {
      title: "Fixture API",
      version: "1.0.0"
    },
    paths
  }, null, 2)}\n`;
}

function jsonGetOperation(required: string[], properties: string[]): Record<string, unknown> {
  return {
    responses: {
      "200": jsonResponse(required, properties)
    }
  };
}

function jsonResponse(required: string[], properties: string[]): Record<string, unknown> {
  return {
    description: "ok",
    content: {
      "application/json": {
        schema: {
          type: "object",
          required,
          properties: Object.fromEntries(properties.map((property) => [property, { type: "string" }]))
        }
      }
    }
  };
}

function differentialProbeConfig(allowCommands: boolean): string {
  return [
    "version: 1",
    "commands: {}",
    "probes:",
    "  - name: value probe",
    "    command: node probe.js",
    "    timeoutMs: 1000",
    "safety:",
    "  commandTimeoutMs: 1000",
    `  allowCommands: ${allowCommands}`,
    ""
  ].join("\n");
}
