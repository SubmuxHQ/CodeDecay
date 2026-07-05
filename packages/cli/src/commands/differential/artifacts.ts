import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DifferentialProbeArtifacts, DifferentialSideResult } from "../../types";

export function createDifferentialRunId(startedAt: number): string {
  return new Date(startedAt).toISOString().replace(/[^0-9a-z]/gi, "-").replace(/-+$/g, "");
}

export function writeDifferentialProbeArtifacts(input: {
  rootDir: string;
  runId: string;
  probeId: string;
  base: DifferentialSideResult;
  head: DifferentialSideResult;
}): DifferentialProbeArtifacts | undefined {
  const directory = join(".codedecay", "local", "differential", sanitizeArtifactSegment(input.runId), sanitizeArtifactSegment(input.probeId));
  const artifacts: DifferentialProbeArtifacts = {
    directory,
    baseResult: join(directory, "base.result.json"),
    headResult: join(directory, "head.result.json"),
    baseStdout: join(directory, "base.stdout.txt"),
    headStdout: join(directory, "head.stdout.txt"),
    baseStderr: join(directory, "base.stderr.txt"),
    headStderr: join(directory, "head.stderr.txt")
  };

  try {
    writeArtifact(input.rootDir, artifacts.baseResult, `${JSON.stringify(input.base, null, 2)}\n`);
    writeArtifact(input.rootDir, artifacts.headResult, `${JSON.stringify(input.head, null, 2)}\n`);
    writeArtifact(input.rootDir, artifacts.baseStdout, input.base.stdout);
    writeArtifact(input.rootDir, artifacts.headStdout, input.head.stdout);
    writeArtifact(input.rootDir, artifacts.baseStderr, input.base.stderr);
    writeArtifact(input.rootDir, artifacts.headStderr, input.head.stderr);
    return artifacts;
  } catch {
    return undefined;
  }
}

function writeArtifact(rootDir: string, path: string, contents: string): void {
  const fullPath = join(rootDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function sanitizeArtifactSegment(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.slice(0, 96) || "probe";
}
