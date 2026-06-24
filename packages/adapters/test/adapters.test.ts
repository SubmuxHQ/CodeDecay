import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import { createCommandAdapter, createConfiguredCommandAdapters, runAdapters, type AdapterContext } from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("adapter runner", () => {
  it("runs command adapters and captures output", async () => {
    const adapter = createCommandAdapter({
      id: "node-version",
      name: "Node version",
      command: "node -e \"console.log('adapter ok')\""
    });

    const result = await runOne(adapter, createContext({ allowCommands: true }));

    expect(result).toMatchObject({
      id: "node-version",
      name: "Node version",
      status: "passed",
      exitCode: 0,
      stdout: "adapter ok\n",
      stderr: ""
    });
  });

  it("captures failed command adapters", async () => {
    const adapter = createCommandAdapter({
      id: "failing-command",
      name: "Failing command",
      command: "node -e \"console.error('boom'); process.exit(7)\""
    });

    const result = await runOne(adapter, createContext({ allowCommands: true }));

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 7,
      stdout: "",
      stderr: "boom\n"
    });
  });

  it("skips configured command adapters when command execution is disabled", async () => {
    const adapter = createCommandAdapter({
      id: "configured-test",
      name: "Configured test",
      command: "node -e \"console.log('should not run')\"",
      requiresCommandAllowlist: true
    });

    const result = await runOne(adapter, createContext({ allowCommands: false }));

    expect(result).toMatchObject({
      status: "skipped",
      stdout: "",
      stderr: "Command execution is disabled by config safety.allowCommands."
    });
  });

  it("marks command adapters as timed out", async () => {
    const adapter = createCommandAdapter({
      id: "slow-command",
      name: "Slow command",
      command: "node -e \"setTimeout(() => {}, 1000)\"",
      timeoutMs: 50
    });

    const result = await runOne(adapter, createContext({ allowCommands: true }));

    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("Command timed out after 50ms.");
  });

  it("creates allowlisted adapters from explicit config commands and probes", async () => {
    const config = createConfig({ allowCommands: true });
    config.commands.test = ["node -e \"console.log('test')\""];
    config.commands.build = ["node -e \"console.log('build')\""];
    config.commands.start = ["node -e \"console.log('start')\""];
    config.probes = [{ name: "Users API", command: "node -e \"console.log('probe')\"", timeoutMs: 500 }];

    const configured = createConfiguredCommandAdapters(config);

    expect(configured.map((item) => [item.kind, item.command])).toEqual([
      ["test", "node -e \"console.log('test')\""],
      ["build", "node -e \"console.log('build')\""],
      ["start", "node -e \"console.log('start')\""],
      ["probe", "node -e \"console.log('probe')\""]
    ]);
    expect(configured.map((item) => item.adapter.id)).toEqual(["test-1", "build-1", "start-1", "probe-users-api"]);
  });

  it("keeps configured command adapters disabled unless safety.allowCommands is true", async () => {
    const config = createConfig({ allowCommands: false });
    config.commands.test = ["node -e \"console.log('should not run')\""];
    const [configured] = createConfiguredCommandAdapters(config);

    if (!configured) {
      throw new Error("Expected configured adapter.");
    }

    const result = await runOne(configured.adapter, createContext({ allowCommands: false }));

    expect(result.status).toBe("skipped");
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Command execution is disabled");
  });

  it("blocks destructive configured command adapters through the execution policy", async () => {
    const adapter = createCommandAdapter({
      id: "unsafe-command",
      name: "Unsafe command",
      command: "rm -rf ./dist",
      requiresCommandAllowlist: true
    });

    const result = await runOne(adapter, createContext({ allowCommands: true }));

    expect(result).toMatchObject({
      status: "skipped",
      stdout: "",
      error: "Command was blocked by CodeDecay safety policy: recursive or forced file deletion."
    });
  });
});

async function runOne(
  adapter: ReturnType<typeof createCommandAdapter>,
  context: AdapterContext
): Promise<Awaited<ReturnType<typeof runAdapters>>[number]> {
  const [result] = await runAdapters([adapter], context);
  if (!result) {
    throw new Error("Expected adapter result.");
  }

  return result;
}

function createContext(input: { allowCommands: boolean }): AdapterContext {
  return {
    rootDir: createTempDir(),
    changedFiles: [],
    config: createConfig(input)
  };
}

function createConfig(input: { allowCommands: boolean }): CodeDecayConfig {
  return {
    version: 1,
    commands: {
      test: [],
      build: [],
      start: []
    },
    probes: [],
    safety: {
      commandTimeoutMs: 1000,
      allowCommands: input.allowCommands
    },
    llm: {
      provider: "disabled",
      timeoutMs: 30_000
    },
    toolAdapters: {}
  };
}

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-adapters-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}
