import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createTempDir, currentCliVersion, run, writeFile } from "./helpers";

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
