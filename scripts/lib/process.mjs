import { spawnSync } from "node:child_process";

export function runCommand(command, args, options = {}) {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
    maxBuffer: options.maxBuffer,
    timeout: options.timeoutMs
  });
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;

  return {
    result,
    startedAt,
    finishedAt,
    durationMs,
    exitCode: typeof result.status === "number" ? result.status : result.signal ? 1 : 2,
    signal: result.signal ?? undefined,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error) : undefined
  };
}
