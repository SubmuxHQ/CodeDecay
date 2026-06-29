import { resolve } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createLlmProvider, type LlmCompletion } from "@submuxhq/codedecay-llm";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { formatLlmReviewError } from "./llm-review/errors";
import { summarizeReportForLlmReview } from "./llm-review/summary";
import { parseLlmReviewArgs } from "../parsers/args";
import { renderLlmReviewReport } from "../renderers/llm-review";
import type {
  CliAnalysisContext,
  CliCommandContext,
  CliRuntime,
  LlmReviewOptions,
  LlmReviewReport
} from "../types";

export interface LlmReviewCommandDependencies {
  resolveRepoRoot(cwd: string, options: LlmReviewOptions): string;
  createAnalysisContext(rootDir: string, options: LlmReviewOptions): CliAnalysisContext;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runLlmReviewCommand(
  context: CliCommandContext,
  dependencies: LlmReviewCommandDependencies
): Promise<void> {
  const options = parseLlmReviewArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const report = await createLlmReviewForCli(cwd, options, dependencies);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderLlmReviewReport(report, options.format),
    runtime: context.runtime
  });
}

async function createLlmReviewForCli(
  cwd: string,
  options: LlmReviewOptions,
  dependencies: LlmReviewCommandDependencies
): Promise<LlmReviewReport> {
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const llmConfig = loadedConfig.config.llm;

  if (llmConfig.provider === "disabled") {
    throw new Error(
      'LLM review requires llm.provider to be set to "ollama" or "litellm". See docs/llm-providers.md and run "codedecay config --format markdown" to verify the loaded config.'
    );
  }

  let provider;
  try {
    provider = createLlmProvider(llmConfig);
  } catch (error: unknown) {
    throw formatLlmReviewError(error, llmConfig.provider);
  }

  let analysis: CliAnalysisContext | undefined;
  if (!options.ping) {
    analysis = dependencies.createAnalysisContext(rootDir, options);
  }

  let completion: LlmCompletion;
  try {
    completion = await provider.complete({
      task: options.task ?? (options.ping ? "Validate CodeDecay LLM provider connectivity." : "Find overlooked regression risks and stronger verification steps for this pull request."),
      instructions: options.ping
        ? "Return JSON when possible with an empty suggestions array. This is a provider connectivity and configuration check."
        : [
            "Ground your review in the deterministic CodeDecay evidence below.",
            "Focus on overlooked regression risks, missing real-world paths, and stronger verification ideas.",
            "If a route or API boundary is already identified, reason from that boundary instead of giving generic advice.",
            "Do not propose commands to execute.",
            "Return at most 8 suggestions as structured JSON when possible."
          ].join(" "),
      context: options.ping ? { tool: "CodeDecay", mode: "llm-review-ping" } : summarizeReportForLlmReview(analysis?.report)
    });
  } catch (error: unknown) {
    throw formatLlmReviewError(error, llmConfig.provider);
  }

  const audit = analysis ? createTestProofAudit(analysis.report) : undefined;
  const report: LlmReviewReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    mode: options.ping ? "ping" : "review",
    provider: {
      id: completion.providerId,
      configuredProvider: llmConfig.provider,
      timeoutMs: llmConfig.timeoutMs
    },
    suggestions: completion.suggestions,
    rawText: completion.text,
    untrusted: true
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  if (analysis?.report.base) {
    report.base = analysis.report.base;
  }

  if (analysis?.report.head) {
    report.head = analysis.report.head;
  }

  if (completion.model ?? llmConfig.model) {
    report.provider.model = completion.model ?? llmConfig.model;
  }

  if (llmConfig.endpoint) {
    report.provider.endpoint = llmConfig.endpoint;
  }

  if (llmConfig.apiKeyEnv) {
    report.provider.apiKeyEnv = llmConfig.apiKeyEnv;
  }

  if (analysis) {
    report.summary = {
      mergeRiskScore: analysis.report.summary.mergeRiskScore,
      decayScore: analysis.report.summary.decayScore,
      riskLevel: analysis.report.summary.riskLevel,
      changedFiles: analysis.report.changedFiles.length,
      impactedAreas: analysis.report.impactedAreas.length,
      impactedRoutes: analysis.report.impactedRoutes?.length ?? 0,
      evidenceMode: audit?.evidenceMode ?? "heuristic_only"
    };
  }

  return report;
}
