import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createHighRiskRepo,
  createLowRiskRepo,
  createMediumRiskRepo,
  createNextjsExampleRepo,
  createNodeApiExampleRepo,
  createRepo,
  createTempDir,
  currentCliVersion,
  ensureBuiltCli,
  git,
  gitOutput,
  repoRoot,
  runBuilt,
  writeFile
} from "./helpers/built-cli";

beforeAll(ensureBuiltCli);

describe("built codedecay CLI command surface", () => {
  it("supports help, man, version, and update from the built CLI", () => {
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

    const help = runBuilt(["help", "analyze"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("CodeDecay analyze");
    expect(help.stdout).toContain("--fail-on <level>");

    const analyzeHelp = runBuilt(["analyze", "--help"]);
    expect(analyzeHelp.status).toBe(0);
    expect(analyzeHelp.stdout).toContain("CodeDecay analyze");
    expect(analyzeHelp.stdout).toContain("--fail-on <level>");

    const redteamHelp = runBuilt(["redteam", "--help"]);
    expect(redteamHelp.status).toBe(0);
    expect(redteamHelp.stdout).toContain("CodeDecay redteam");
    expect(redteamHelp.stdout).toContain("--fail-on <level>");

    const agentHelp = runBuilt(["agent", "--help"]);
    expect(agentHelp.status).toBe(0);
    expect(agentHelp.stdout).toContain("CodeDecay agent");
    expect(agentHelp.stdout).toContain("--profile <profile>");

    const productHelp = runBuilt(["product", "--help"]);
    expect(productHelp.status).toBe(0);
    expect(productHelp.stdout).toContain("CodeDecay product");
    expect(productHelp.stdout).toContain("--target <id>");

    const dashboardHelp = runBuilt(["dashboard", "--help"]);
    expect(dashboardHelp.status).toBe(0);
    expect(dashboardHelp.stdout).toContain("CodeDecay dashboard");
    expect(dashboardHelp.stdout).toContain("--input <path>");

    const differentialHelp = runBuilt(["differential", "--help"]);
    expect(differentialHelp.status).toBe(0);
    expect(differentialHelp.stdout).toContain("CodeDecay differential");
    expect(differentialHelp.stdout).toContain("--base <ref>");

    const snapshotHelp = runBuilt(["snapshot", "--help"]);
    expect(snapshotHelp.status).toBe(0);
    expect(snapshotHelp.stdout).toContain("CodeDecay snapshot");
    expect(snapshotHelp.stdout).toContain("--compare <path>");

    const llmReviewHelp = runBuilt(["llm-review", "--help"]);
    expect(llmReviewHelp.status).toBe(0);
    expect(llmReviewHelp.stdout).toContain("CodeDecay llm-review");
    expect(llmReviewHelp.stdout).toContain("--task <text>");

    const doctorHelp = runBuilt(["doctor", "--help"]);
    expect(doctorHelp.status).toBe(0);
    expect(doctorHelp.stdout).toContain("CodeDecay doctor");
    expect(doctorHelp.stdout).toContain("--write-config-preview");

    const manual = runBuilt(["man", "update"]);
    expect(manual.status).toBe(0);
    expect(manual.stdout).toContain("CODEDECAY-UPDATE(1)");

    const version = runBuilt(["version"]);
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(currentCliVersion());

    const update = runBuilt(["update", "--cwd", cwd]);
    expect(update.status).toBe(0);
    expect(update.stdout).toContain("Package manager: pnpm (package.json#packageManager)");
    expect(update.stdout).toContain("pnpm add -D @submuxhq/codedecay@latest");

    const updateWithManagerOverride = runBuilt(["update", "--cwd", cwd, "--manager", "npm"]);
    expect(updateWithManagerOverride.status).toBe(0);
    expect(updateWithManagerOverride.stdout).toContain("Package manager: npm (override)");
    expect(updateWithManagerOverride.stdout).toContain("npm install -D @submuxhq/codedecay@latest");

    const uninstallHelp = runBuilt(["help", "uninstall"]);
    expect(uninstallHelp.status).toBe(0);
    expect(uninstallHelp.stdout).toContain("--purge-local");

    writeFile(cwd, ".codedecay/config.yml", "version: 1\n");
    writeFile(cwd, "codedecay-redteam.md", "# report\n");
    const uninstall = runBuilt(["uninstall", "--cwd", cwd, "--purge-local"]);
    expect(uninstall.status).toBe(0);
    expect(uninstall.stdout).toContain("pnpm remove @submuxhq/codedecay");
    expect(uninstall.stdout).toContain(".codedecay");

    const uninstallWithManagerOverride = runBuilt(["uninstall", "--cwd", cwd, "--manager=npm"]);
    expect(uninstallWithManagerOverride.status).toBe(0);
    expect(uninstallWithManagerOverride.stdout).toContain("Package manager: npm (override)");
    expect(uninstallWithManagerOverride.stdout).toContain("npm uninstall @submuxhq/codedecay");
  });

  it("suggests similar commands and flags from the built CLI", () => {
    const repo = createLowRiskRepo();

    const command = runBuilt(["analyz"]);
    expect(command.status).toBe(2);
    expect(command.stdout).toBe("");
    expect(command.stderr).toContain('Unknown command: analyz. Did you mean "analyze"?');
    expect(command.stderr).toContain('Run "codedecay help" for available commands.');

    const option = runBuilt(["analyze", "--failonn", "--cwd", repo]);
    expect(option.status).toBe(2);
    expect(option.stdout).toBe("");
    expect(option.stderr).toContain(
      'Unknown option for codedecay analyze: --failonn. Did you mean "--fail-on"?'
    );
    expect(option.stderr).toContain('Run "codedecay help analyze" to see supported options.');
  });

  it("prints loaded config from the built CLI", () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      ["version: 1", "commands:", "  test: pnpm test", "safety:", "  commandTimeoutMs: 15000", ""].join("\n")
    );

    const configHelp = runBuilt(["config", "--help"]);
    expect(configHelp.status).toBe(0);
    expect(configHelp.stdout).toContain("CodeDecay config");
    expect(configHelp.stdout).toContain("--format <format>");

    const result = runBuilt(["config", "--cwd", repo, "--format", "json"]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      config: {
        commands: {
          test: ["pnpm test"]
        },
        safety: {
          commandTimeoutMs: 15000
        }
      }
    });

    const mcpHelp = runBuilt(["mcp", "--help"]);
    expect(mcpHelp.status).toBe(0);
    expect(mcpHelp.stdout).toContain("CodeDecay mcp");
    expect(mcpHelp.stdout).toContain("--cwd <path>");
  });

  it("supports memory parser behavior from the built CLI", () => {
    const repo = createLowRiskRepo();

    const memoryHelp = runBuilt(["memory", "--help"]);
    expect(memoryHelp.status).toBe(0);
    expect(memoryHelp.stdout).toContain("CodeDecay memory");
    expect(memoryHelp.stdout).toContain("--format <format>");

    const memory = runBuilt(["memory", "--cwd", repo, "--format", "json"]);
    expect(memory.status).toBe(0);
    expect(JSON.parse(memory.stdout)).toMatchObject({
      memory: {
        version: 1,
        flows: [],
        commands: [],
        invariants: [],
        architecture: [],
        regressions: []
      }
    });

    const memoryImportHelp = runBuilt(["memory-import", "--help"]);
    expect(memoryImportHelp.status).toBe(0);
    expect(memoryImportHelp.stdout).toContain("CodeDecay memory-import");
    expect(memoryImportHelp.stdout).toContain("--input <path>");

    const memoryImportMissingInput = runBuilt(["memory-import", "--cwd", repo]);
    expect(memoryImportMissingInput.status).toBe(2);
    expect(memoryImportMissingInput.stderr).toContain(
      'Missing value for --input. Use "codedecay help memory-import" for usage.'
    );

    const memoryLearnHelp = runBuilt(["memory-learn", "--help"]);
    expect(memoryLearnHelp.status).toBe(0);
    expect(memoryLearnHelp.stdout).toContain("CodeDecay memory-learn");
    expect(memoryLearnHelp.stdout).toContain("--input <path>");

    const memoryLearnMissingInput = runBuilt(["memory-learn", "--cwd", repo]);
    expect(memoryLearnMissingInput.status).toBe(2);
    expect(memoryLearnMissingInput.stderr).toContain(
      'Missing value for --input. Use "codedecay help memory-learn" for usage.'
    );
  });
});
