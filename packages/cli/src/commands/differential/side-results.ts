import {
  createConfiguredCommandAdapters,
  runAdapters,
  type AdapterResult
} from "@submuxhq/codedecay-adapters";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import type { DifferentialSideResult, DifferentialStatus } from "../../types";

export async function runDifferentialSide(
  adapter: ReturnType<typeof createConfiguredCommandAdapters>[number]["adapter"],
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<DifferentialSideResult> {
  const [result] = await runAdapters([adapter], {
    rootDir,
    changedFiles: [],
    config: loadedConfig.config
  });

  if (!result) {
    return {
      status: "error",
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "Adapter did not return a result."
    };
  }

  return toDifferentialSide(result);
}

export function compareDifferentialSides(base: DifferentialSideResult, head: DifferentialSideResult): string[] {
  const differences: string[] = [];

  if (base.status !== head.status) {
    differences.push(`status changed from ${base.status} to ${head.status}`);
  }

  if (base.exitCode !== head.exitCode) {
    differences.push(`exit code changed from ${formatOptionalNumber(base.exitCode)} to ${formatOptionalNumber(head.exitCode)}`);
  }

  if (base.structuredOutput !== undefined || head.structuredOutput !== undefined) {
    differences.push(...compareStructuredOutput(base.structuredOutput, head.structuredOutput));
  } else if (normalizeOutput(base.stdout) !== normalizeOutput(head.stdout)) {
    differences.push("stdout changed");
  }

  if (normalizeOutput(base.stderr) !== normalizeOutput(head.stderr)) {
    differences.push("stderr changed");
  }

  return differences;
}

export function differentialProbeStatus(
  base: DifferentialSideResult,
  head: DifferentialSideResult,
  differences: string[]
): DifferentialStatus {
  if (isDifferentialSideInfrastructureFailure(base) || isDifferentialSideInfrastructureFailure(head)) {
    return "failed";
  }

  if (base.status === "skipped" && head.status === "skipped") {
    return "skipped";
  }

  return differences.length > 0 ? "changed" : "passed";
}

function toDifferentialSide(result: AdapterResult): DifferentialSideResult {
  const side: DifferentialSideResult = {
    status: result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr
  };

  if (result.exitCode !== undefined) {
    side.exitCode = result.exitCode;
  }

  if (result.error) {
    side.error = result.error;
  }

  const structuredOutput = parseStructuredOutput(result.stdout);
  if (structuredOutput !== undefined) {
    side.structuredOutput = structuredOutput;
  }

  return side;
}

function isDifferentialSideInfrastructureFailure(side: DifferentialSideResult): boolean {
  return side.status === "error" || side.status === "timed_out";
}

function parseStructuredOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function compareStructuredOutput(base: unknown, head: unknown): string[] {
  if (stableJson(base) === stableJson(head)) {
    return [];
  }

  const differences = compareStructuredValue(base, head, []);
  return differences.length > 0 ? differences.slice(0, 12) : ["structured stdout changed"];
}

function compareStructuredValue(base: unknown, head: unknown, path: string[]): string[] {
  if (stableJson(base) === stableJson(head)) {
    return [];
  }

  if (isRecord(base) && isRecord(head)) {
    const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].sort((left, right) => left.localeCompare(right));
    return keys.flatMap((key) => {
      const nextPath = [...path, key];
      if (!(key in base)) {
        return [`structured stdout field ${formatJsonPath(nextPath)} added: ${formatStructuredValue(head[key])}`];
      }

      if (!(key in head)) {
        return [`structured stdout field ${formatJsonPath(nextPath)} removed: ${formatStructuredValue(base[key])}`];
      }

      return compareStructuredValue(base[key], head[key], nextPath);
    });
  }

  return [
    `structured stdout changed at ${formatJsonPath(path)}: ${formatStructuredValue(base)} -> ${formatStructuredValue(head)}`
  ];
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)])
    );
  }

  return value;
}

function normalizeOutput(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "none" : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatJsonPath(path: string[]): string {
  return path.length === 0 ? "$" : path.join(".");
}

function formatStructuredValue(value: unknown): string {
  const formatted = JSON.stringify(value);
  if (formatted === undefined) {
    return "undefined";
  }

  return formatted.length > 120 ? `${formatted.slice(0, 117)}...` : formatted;
}
