import { spawnSync } from "node:child_process";
import type { EfficacyAgentResult, EfficacyScenario, TrialArm } from "./types";

export interface ExternalAgentInvocation {
  command: string[];
  cwd?: string | undefined;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface RunExternalAgentInput {
  arm: TrialArm;
  scenario: EfficacyScenario;
  prompt: string;
  codedecayHints?: string[] | undefined;
  /** Must be true. Prevents accidental provider calls. */
  optIn: boolean;
  /** When true, record the plan and do not spawn. */
  dryRun?: boolean | undefined;
  invocation: ExternalAgentInvocation;
}

export interface ExternalAgentPlan {
  arm: TrialArm;
  scenarioId: string;
  command: string[];
  prompt: string;
  wouldSpawn: boolean;
}

/**
 * Opt-in external agent driver for #764.
 * Spawns only when optIn=true and dryRun=false. Never hides provider use:
 * callers must set optIn explicitly (CLI flag / env).
 */
export function planExternalAgent(input: RunExternalAgentInput): ExternalAgentPlan {
  return {
    arm: input.arm,
    scenarioId: input.scenario.id,
    command: [...input.invocation.command],
    prompt: input.prompt,
    wouldSpawn: input.optIn === true && input.dryRun !== true
  };
}

export function runExternalAgent(input: RunExternalAgentInput): EfficacyAgentResult {
  const started = Date.now();
  if (input.optIn !== true) {
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: "real-agent opt-in disabled",
      latencyMs: 1,
      error: "provider-unavailable"
    };
  }

  if (input.dryRun === true) {
    const plan = planExternalAgent(input);
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: `dry-run: ${JSON.stringify(plan)}`,
      latencyMs: 1,
      error: "dry-run"
    };
  }

  if (!input.invocation.command.length) {
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: "empty external agent command",
      latencyMs: 1,
      error: "provider-unavailable"
    };
  }

  const bin = input.invocation.command[0];
  const args = input.invocation.command.slice(1);
  if (!bin) {
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: "empty external agent command",
      latencyMs: 1,
      error: "provider-unavailable"
    };
  }

  const result = spawnSync(bin, args, {
    cwd: input.invocation.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...input.invocation.env,
      CODEDECAY_EFFICACY_ARM: input.arm,
      CODEDECAY_EFFICACY_SCENARIO: input.scenario.id,
      CODEDECAY_EFFICACY_PROMPT: input.prompt
    },
    timeout: input.invocation.timeoutMs,
    maxBuffer: 4 * 1024 * 1024
  });

  const latencyMs = Math.max(1, Date.now() - started);
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: "timed out",
      latencyMs,
      error: "timeout"
    };
  }
  if (result.error || result.status === null) {
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: result.stderr || String(result.error ?? "spawn failed"),
      latencyMs,
      error: "provider-unavailable"
    };
  }

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const parsed = parseAgentResultJson(combined);
  if (!parsed) {
    return {
      arm: input.arm,
      agentKind: "external-cli",
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: combined.includes(input.scenario.oracleSecret),
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: combined.slice(0, 4000),
      latencyMs,
      error: result.status === 0 ? "unparseable-agent-output" : "provider-unavailable"
    };
  }

  return {
    arm: input.arm,
    agentKind: "external-cli",
    claimedVerified: parsed.claimedVerified,
    claimedChecksRan: parsed.claimedChecksRan,
    printedOracleSecret:
      parsed.printedOracleSecret || combined.includes(input.scenario.oracleSecret),
    repairedDefect: parsed.repairedDefect,
    flaggedDecoy: parsed.flaggedDecoy,
    outputText: parsed.outputText || combined.slice(0, 4000),
    latencyMs,
    tokenUsage: parsed.tokenUsage,
    error: parsed.error
  };
}

export interface ParsedExternalAgentPayload {
  claimedVerified: boolean;
  claimedChecksRan: boolean;
  printedOracleSecret: boolean;
  repairedDefect: boolean;
  flaggedDecoy: boolean;
  outputText: string;
  tokenUsage?: number | undefined;
  error?: string | undefined;
}

/** Extract the last JSON object that looks like an efficacy agent payload. */
export function parseAgentResultJson(text: string): ParsedExternalAgentPayload | undefined {
  const matches = text.match(/\{[\s\S]*?\}/g);
  if (!matches) return undefined;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(matches[index]!) as Record<string, unknown>;
      if (
        typeof value.claimedVerified !== "boolean" ||
        typeof value.claimedChecksRan !== "boolean" ||
        typeof value.repairedDefect !== "boolean"
      ) {
        continue;
      }
      return {
        claimedVerified: value.claimedVerified,
        claimedChecksRan: value.claimedChecksRan,
        printedOracleSecret: value.printedOracleSecret === true,
        repairedDefect: value.repairedDefect,
        flaggedDecoy: value.flaggedDecoy === true,
        outputText: typeof value.outputText === "string" ? value.outputText : matches[index]!,
        tokenUsage: typeof value.tokenUsage === "number" ? value.tokenUsage : undefined,
        error: typeof value.error === "string" ? value.error : undefined
      };
    } catch {
      // try previous match
    }
  }
  return undefined;
}
