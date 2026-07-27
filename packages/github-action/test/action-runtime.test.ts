import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runActionStep } from "./helpers/action-runtime";

const actionDefinitionPath = join(process.cwd(), "packages/github-action/action.yml");
let fixtureRoot = "";
let actionPath = "";
let workspace = "";
let runnerTemp = "";
let recordPath = "";

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "codedecay-action-runtime-"));
  actionPath = join(fixtureRoot, "packages/github-action");
  workspace = join(fixtureRoot, "workspace");
  runnerTemp = join(fixtureRoot, "runner-temp");
  recordPath = join(fixtureRoot, "cli-records.jsonl");
  const cliPath = join(fixtureRoot, "packages/cli/dist/index.js");

  mkdirSync(actionPath, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  mkdirSync(runnerTemp, { recursive: true });
  mkdirSync(join(fixtureRoot, "packages/cli/dist"), { recursive: true });
  writeFileSync(cliPath, fakeCliSource(), "utf8");
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("GitHub Action shell runtime", () => {
  it("forwards the complete AI contract as exact argv", () => {
    const result = runMainStep({
      mode: "ai",
      cwd: "services/api",
      format: "json",
      base: "origin/main",
      head: "HEAD",
      output: "reports/ai report.json",
      task: "Protect billing export",
      requirements: ".codedecay/requirements.yml",
      profile: "claude-code",
      "with-checks": "true",
      "fail-on-requirements": "true",
      "fail-on": "high"
    });

    expect(result).toMatchObject({ status: 0, stderr: "", timedOut: false });
    expect(readRecords()).toEqual([
      {
        argv: [
          "ai",
          "--cwd",
          "services/api",
          "--format",
          "json",
          "--base",
          "origin/main",
          "--head",
          "HEAD",
          "--output",
          "reports/ai report.json",
          "--task",
          "Protect billing export",
          "--requirements",
          ".codedecay/requirements.yml",
          "--profile",
          "claude-code",
          "--with-checks",
          "--fail-on-requirements",
          "--fail-on",
          "high"
        ],
        cwd: realpathSync(workspace),
        githubToken: null,
        previewUrl: null
      }
    ]);
  });

  it("does not forward mode-specific flags to unsupported commands", () => {
    expect(
      runMainStep({
        mode: "redteam",
        profile: "cursor",
        "with-checks": "true",
        "fail-on": "medium"
      }).status
    ).toBe(0);
    expect(
      runMainStep({
        mode: "agent",
        profile: "cursor",
        "with-checks": "true",
        "fail-on-requirements": "true",
        "fail-on": "high"
      }).status
    ).toBe(0);
    expect(
      runMainStep({
        mode: "analyze",
        profile: "claude-code",
        "with-checks": "true",
        "fail-on": "low"
      }).status
    ).toBe(0);

    expect(readRecords().map((record) => record.argv)).toEqual([
      ["redteam", "--cwd", ".", "--format", "markdown", "--with-checks", "--fail-on", "medium"],
      ["agent", "--cwd", ".", "--format", "markdown", "--profile", "cursor"],
      ["analyze", "--cwd", ".", "--format", "markdown", "--fail-on", "low"]
    ]);
  });

  it("propagates the CLI status while summary and comment rendering stay best effort", () => {
    const failureEnv = {
      CODEDECAY_ACTION_RECORD: recordPath,
      CODEDECAY_FAKE_STDOUT: "action report body\n",
      CODEDECAY_FAKE_STDERR: "intentional CLI failure\n",
      CODEDECAY_FAKE_EXIT: "17"
    };
    const main = runActionStep({
      actionDefinitionPath,
      actionPath,
      workspace,
      runnerTemp,
      stepName: "Run CodeDecay",
      inputs: { mode: "agent", format: "json", profile: "codex", "fail-on": "high" },
      env: failureEnv
    });

    expect(main).toMatchObject({
      status: 17,
      stdout: "action report body\n",
      stderr: "intentional CLI failure\n",
      timedOut: false
    });

    const summary = runActionStep({
      actionDefinitionPath,
      actionPath,
      workspace,
      runnerTemp,
      stepName: "Write CodeDecay summary",
      inputs: { mode: "ai", profile: "codex" },
      env: failureEnv
    });

    expect(summary.status).toBe(0);
    expect(summary.stderr).toContain("intentional CLI failure");
    expect(readFileSync(join(runnerTemp, "github-step-summary.md"), "utf8")).toBe("action report body\n");

    const eventPath = join(fixtureRoot, "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({ repository: { full_name: "SubmuxHQ/CodeDecay" }, pull_request: { number: 667 } }),
      "utf8"
    );
    const comment = runActionStep({
      actionDefinitionPath,
      actionPath,
      workspace,
      runnerTemp,
      stepName: "Post CodeDecay pull request comment",
      inputs: { mode: "ai", "github-token": "test-token", base: "origin/main", head: "HEAD" },
      env: {
        ...failureEnv,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath
      }
    });

    expect(comment.status).toBe(0);
    expect(comment.stdout).toContain("CodeDecay PR comment skipped: failed to render pr-comment report.");
    expect(readRecords().map((record) => record.argv)).toEqual([
      ["agent", "--cwd", ".", "--format", "json", "--profile", "codex"],
      ["ai", "--cwd", ".", "--format", "markdown", "--profile", "codex"],
      ["analyze", "--cwd", ".", "--format", "pr-comment", "--base", "origin/main", "--head", "HEAD"]
    ]);
  });

  it("fails explicitly when the packaged CLI entrypoint is missing", () => {
    rmSync(join(fixtureRoot, "packages/cli"), { recursive: true, force: true });

    const result = runMainStep({ mode: "ai" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot find module");
    expect(result.stderr).toContain("packages/cli/dist/index.js");
    expect(existsSync(recordPath)).toBe(false);
  });

  it("rejects unsupported modes and format combinations before invoking the CLI", () => {
    const unsupported = runMainStep({ mode: "execute" });
    expect(unsupported.status).toBe(2);
    expect(unsupported.stderr).toContain("Unsupported CodeDecay mode: execute");

    const invalidFormat = runMainStep({ mode: "ai", format: "sarif" });
    expect(invalidFormat.status).toBe(2);
    expect(invalidFormat.stderr).toContain("CodeDecay mode 'ai' does not support SARIF output.");
    expect(existsSync(recordPath)).toBe(false);
  });
});

function runMainStep(inputs: Record<string, string>) {
  return runActionStep({
    actionDefinitionPath,
    actionPath,
    workspace,
    runnerTemp,
    stepName: "Run CodeDecay",
    inputs,
    env: {
      CODEDECAY_ACTION_RECORD: recordPath
    }
  });
}

function readRecords(): Array<{
  argv: string[];
  cwd: string;
  githubToken: string | null;
  previewUrl: string | null;
}> {
  if (!existsSync(recordPath)) {
    return [];
  }

  return readFileSync(recordPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function fakeCliSource(): string {
  return [
    "const { appendFileSync } = require(\"node:fs\");",
    "const record = {",
    "  argv: process.argv.slice(2),",
    "  cwd: process.cwd(),",
    "  githubToken: process.env.CODEDECAY_GITHUB_TOKEN ?? null,",
    "  previewUrl: process.env.CODEDECAY_PRODUCT_PREVIEW_URL ?? null",
    "};",
    "appendFileSync(process.env.CODEDECAY_ACTION_RECORD, JSON.stringify(record) + \"\\n\", \"utf8\");",
    "if (process.env.CODEDECAY_FAKE_STDOUT) process.stdout.write(process.env.CODEDECAY_FAKE_STDOUT);",
    "if (process.env.CODEDECAY_FAKE_STDERR) process.stderr.write(process.env.CODEDECAY_FAKE_STDERR);",
    "process.exit(Number(process.env.CODEDECAY_FAKE_EXIT ?? 0));",
    ""
  ].join("\n");
}
