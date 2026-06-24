import { lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCodeDecaySkills } from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadCodeDecaySkills", () => {
  it("returns empty skills when the directory is missing", () => {
    const repo = createTempDir();

    expect(loadCodeDecaySkills({ cwd: repo })).toEqual({
      skills: []
    });
  });

  it("loads repo-local skills in stable order", () => {
    const repo = createTempDir();
    writeFile(
      repo,
      ".agents/skills/test-quality-review/SKILL.md",
      ["# Test Quality Review Skill", "", "Use this skill when tests change.", "", "## Checklist", "- real behavior"].join("\n")
    );
    writeFile(
      repo,
      ".agents/skills/pr-red-team/SKILL.md",
      ["# PR Red-Team Skill", "", "Find what a coding agent missed.", ""].join("\n")
    );

    const loaded = loadCodeDecaySkills({ cwd: repo });

    expect(loaded.sourceDir).toBe(join(repo, ".agents", "skills"));
    expect(loaded.skills.map((skill) => skill.id)).toEqual(["pr-red-team", "test-quality-review"]);
    expect(loaded.skills[0]).toMatchObject({
      title: "PR Red-Team Skill",
      path: ".agents/skills/pr-red-team/SKILL.md",
      summary: "Find what a coding agent missed.",
      untrusted: true
    });
  });

  it("ignores skill directories without SKILL.md", () => {
    const repo = createTempDir();
    mkdirSync(join(repo, ".agents/skills/empty"), { recursive: true });
    writeFile(repo, ".agents/skills/api-review/SKILL.md", "# API Review\n\nReview API paths.\n");

    const loaded = loadCodeDecaySkills({ cwd: repo });

    expect(loaded.skills.map((skill) => skill.id)).toEqual(["api-review"]);
  });
});

describe("repo-local agent commands", () => {
  it("keeps redteam-pr aligned with the analyze, redteam, and agent workflow", () => {
    const command = readFileSync(join(process.cwd(), ".agents/commands/redteam-pr.md"), "utf8");

    expect(command).toContain("node packages/cli/dist/index.js analyze --base origin/main --head HEAD --format markdown");
    expect(command).toContain(
      "node packages/cli/dist/index.js redteam --base origin/main --head HEAD --format markdown --output codedecay-redteam.md"
    );
    expect(command).toContain(
      "node packages/cli/dist/index.js agent --base origin/main --head HEAD --format markdown --output codedecay-agent.md"
    );
    expect(command).toContain("Copy-Paste Prompt");
    expect(command).toContain("Keep tool evidence separate from agent suggestions.");
    expect(command).toContain("Do not claim a PR is 100%");
  });
});

describe("local setup guidance", () => {
  it("points contributors to the current agent workflow without requiring cloud or model calls", () => {
    const setup = readFileSync(join(process.cwd(), ".codedecay/setup.local.sh"), "utf8");

    expect(setup).toContain(".agents/commands/redteam-pr.md");
    expect(setup).toContain("analyze, redteam, and agent bundle evidence");
    expect(setup).toContain("codedecay-agent.md");
    expect(setup).toContain("Codex, Claude Code, Cursor, desktop agent, or MCP client");
    expect(setup).toContain("do not require telemetry, API keys, LLM calls, model calls, or CodeDecayCloud");
  });
});

describe("agent platform pointers", () => {
  it("keeps Cursor MCP config aligned with the shared local MCP config", () => {
    const cursorPath = join(process.cwd(), ".cursor/mcp.json");
    const cursorLink = lstatSync(cursorPath);
    const shared = JSON.parse(readFileSync(join(process.cwd(), ".mcp.json"), "utf8"));
    const cursor = JSON.parse(readFileSync(cursorPath, "utf8"));

    expect(cursorLink.isSymbolicLink()).toBe(true);
    expect(readlinkSync(cursorPath)).toBe("../.mcp.json");
    expect(cursor).toEqual(shared);
    expect(cursor.mcpServers.codedecay).toEqual({
      command: "node",
      args: ["packages/cli/dist/index.js", "mcp"]
    });
  });

  it("keeps Claude command and skill directories linked to canonical .agents resources", () => {
    const commands = lstatSync(join(process.cwd(), ".claude/commands"));
    const skills = lstatSync(join(process.cwd(), ".claude/skills"));

    expect(commands.isSymbolicLink()).toBe(true);
    expect(skills.isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(process.cwd(), ".claude/commands"))).toBe("../.agents/commands");
    expect(readlinkSync(join(process.cwd(), ".claude/skills"))).toBe("../.agents/skills");
    expect(readFileSync(join(process.cwd(), ".claude/commands/redteam-pr.md"), "utf8")).toContain(
      "node packages/cli/dist/index.js agent --base origin/main --head HEAD --format markdown --output codedecay-agent.md"
    );
    expect(readFileSync(join(process.cwd(), ".claude/skills/pr-red-team/SKILL.md"), "utf8")).toContain(
      "Find what a coding agent may have missed before merge."
    );
  });
});

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-skills-${process.pid}-${tempRoots.length}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}
