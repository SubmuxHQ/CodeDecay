import type { LoopFormat } from "@submuxhq/codedecay-harness";
import type { LoopOptions } from "../types";
import { parseRiskLevel, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseLoopArgs(args: string[]): LoopOptions {
  const options: LoopOptions = {
    maxRounds: 4,
    format: "markdown",
    safeRiskLevel: "low",
    securityScoreThreshold: 0
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--task=")) {
      options.task = arg.slice("--task=".length);
      continue;
    }

    if (arg === "--task") {
      options.task = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--requirements=")) {
      options.requirements = arg.slice("--requirements=".length);
      continue;
    }

    if (arg === "--requirements") {
      options.requirements = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-rounds=")) {
      options.maxRounds = parseMaxRounds(arg.slice("--max-rounds=".length));
      continue;
    }

    if (arg === "--max-rounds") {
      options.maxRounds = parseMaxRounds(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--agent-cmd=")) {
      options.agentCommand = arg.slice("--agent-cmd=".length);
      continue;
    }

    if (arg === "--agent-cmd") {
      options.agentCommand = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--builder-cmd=")) {
      options.builderCommand = arg.slice("--builder-cmd=".length);
      continue;
    }

    if (arg === "--builder-cmd") {
      options.builderCommand = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--verifier-cmd=")) {
      options.verifierCommand = arg.slice("--verifier-cmd=".length);
      continue;
    }

    if (arg === "--verifier-cmd") {
      options.verifierCommand = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--builder-id=")) {
      options.builderId = arg.slice("--builder-id=".length);
      continue;
    }

    if (arg === "--builder-id") {
      options.builderId = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--verifier-id=")) {
      options.verifierId = arg.slice("--verifier-id=".length);
      continue;
    }

    if (arg === "--verifier-id") {
      options.verifierId = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseLoopFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseLoopFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--safe-risk=")) {
      options.safeRiskLevel = parseRiskLevel(arg.slice("--safe-risk=".length));
      continue;
    }

    if (arg === "--safe-risk") {
      options.safeRiskLevel = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-security-score=")) {
      options.securityScoreThreshold = parseSecurityScoreThreshold(arg.slice("--max-security-score=".length));
      continue;
    }

    if (arg === "--max-security-score") {
      options.securityScoreThreshold = parseSecurityScoreThreshold(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-wall-time-ms=")) {
      options.maxWallTimeMs = parsePositiveInt(arg.slice("--max-wall-time-ms=".length), "--max-wall-time-ms");
      continue;
    }
    if (arg === "--max-wall-time-ms") {
      options.maxWallTimeMs = parsePositiveInt(requireValue(args, index, arg), "--max-wall-time-ms");
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-changed-files=")) {
      options.maxChangedFiles = parsePositiveInt(arg.slice("--max-changed-files=".length), "--max-changed-files");
      continue;
    }
    if (arg === "--max-changed-files") {
      options.maxChangedFiles = parsePositiveInt(requireValue(args, index, arg), "--max-changed-files");
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-model-calls=")) {
      options.maxModelCalls = parsePositiveInt(arg.slice("--max-model-calls=".length), "--max-model-calls");
      continue;
    }
    if (arg === "--max-model-calls") {
      options.maxModelCalls = parsePositiveInt(requireValue(args, index, arg), "--max-model-calls");
      index += 1;
      continue;
    }

    if (arg.startsWith("--allowed-path=")) {
      options.allowedPaths = [...(options.allowedPaths ?? []), arg.slice("--allowed-path=".length)];
      continue;
    }
    if (arg === "--allowed-path") {
      options.allowedPaths = [...(options.allowedPaths ?? []), requireValue(args, index, arg)];
      index += 1;
      continue;
    }

    if (arg.startsWith("--protected-path=")) {
      options.protectedPaths = [...(options.protectedPaths ?? []), arg.slice("--protected-path=".length)];
      continue;
    }
    if (arg === "--protected-path") {
      options.protectedPaths = [...(options.protectedPaths ?? []), requireValue(args, index, arg)];
      index += 1;
      continue;
    }

    if (arg.startsWith("--resume-from=")) {
      options.resumeFrom = arg.slice("--resume-from=".length);
      continue;
    }
    if (arg === "--resume-from") {
      options.resumeFrom = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--run-id=")) {
      options.runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--run-id") {
      options.runId = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "loop");
  }

  return options;
}

function parseLoopFormat(value: string): LoopFormat {
  if (value === "json" || value === "markdown") {
    return value;
  }

  throw new Error(`Invalid loop format "${value}". Expected json or markdown.`);
}

function parseMaxRounds(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new Error(`Invalid --max-rounds "${value}". Expected a positive integer.`);
}

function parseSecurityScoreThreshold(value: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
    return parsed;
  }

  throw new Error(`Invalid --max-security-score "${value}". Expected a number from 0 to 100.`);
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  throw new Error(`Invalid ${flag} "${value}". Expected a positive integer.`);
}
