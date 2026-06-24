import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCommandSafety, runConfiguredCommand } from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("safe command runner", () => {
  it("runs explicit commands and captures output", async () => {
    const result = await runCommand("node -e \"console.log('execution ok')\"");

    expect(result).toMatchObject({
      status: "passed",
      exitCode: 0,
      stdout: "execution ok\n",
      stderr: ""
    });
  });

  it("captures failed commands", async () => {
    const result = await runCommand("node -e \"console.error('boom'); process.exit(9)\"");

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 9,
      stdout: "",
      stderr: "boom\n"
    });
  });

  it("skips commands when execution is disabled", async () => {
    const result = await runConfiguredCommand({
      command: "node -e \"console.log('should not run')\"",
      cwd: createTempDir(),
      timeoutMs: 1000,
      safety: {
        allowCommands: false
      }
    });

    expect(result).toMatchObject({
      status: "skipped",
      stdout: "",
      stderr: "Command execution is disabled by config safety.allowCommands."
    });
  });

  it("marks commands as timed out", async () => {
    const result = await runCommand("node -e \"setTimeout(() => {}, 1000)\"", { timeoutMs: 50 });

    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("Command timed out after 50ms.");
  });

  it("keeps only the tail of large output", async () => {
    const result = await runCommand("node -e \"process.stdout.write('a'.repeat(20) + 'tail')\"", {
      outputLimit: 8
    });

    expect(result.stdout).toBe("aaaatail");
  });

  it("blocks obvious destructive commands by default", async () => {
    const result = await runCommand("rm -rf ./dist");

    expect(result).toMatchObject({
      status: "blocked",
      stdout: "",
      blockedReason: "recursive or forced file deletion"
    });
    expect(result.stderr).toContain("Command was blocked by CodeDecay safety policy");
  });

  it("can explicitly allow commands that match the unsafe policy", async () => {
    const result = await runCommand("node -e \"console.log('allowed')\"", {
      allowUnsafeCommands: true
    });

    expect(result.status).toBe("passed");
  });

  it("classifies deploy and migration commands as unsafe", () => {
    expect(checkCommandSafety("pnpm publish")).toEqual({
      safe: false,
      reason: "package publish"
    });
    expect(checkCommandSafety("prisma migrate deploy")).toEqual({
      safe: false,
      reason: "database migration or push command"
    });
    expect(checkCommandSafety("pnpm test")).toEqual({
      safe: true
    });
  });
});

async function runCommand(
  command: string,
  options: {
    timeoutMs?: number | undefined;
    outputLimit?: number | undefined;
    allowUnsafeCommands?: boolean | undefined;
  } = {}
) {
  return await runConfiguredCommand({
    command,
    cwd: createTempDir(),
    timeoutMs: options.timeoutMs ?? 1000,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: true,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
}

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-execution-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}
