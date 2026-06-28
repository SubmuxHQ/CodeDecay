import { resolve } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION, type CodeDecayReport } from "@submuxhq/codedecay-core";
import { createLlmProvider, type LlmCompletion } from "@submuxhq/codedecay-llm";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
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

function summarizeReportForLlmReview(report: CodeDecayReport | undefined): Record<string, unknown> | undefined {
  if (!report) {
    return undefined;
  }

  const testAudit = createTestProofAudit(report);
  return {
    summary: {
      mergeRiskScore: report.summary.mergeRiskScore,
      decayScore: report.summary.decayScore,
      riskLevel: report.summary.riskLevel,
      findingCounts: report.summary.findingCounts,
      mergeRiskBreakdown: report.summary.mergeRiskBreakdown,
      decayBreakdown: report.summary.decayBreakdown,
      testEvidence: report.testEvidence,
      testAuditStatus: testAudit.status,
      evidenceMode: testAudit.evidenceMode
    },
    changedFiles: report.changedFiles.map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions
    })),
    impactedAreas: report.impactedAreas,
    impactedRoutes: report.impactedRoutes ?? [],
    findings: report.findings.slice(0, 20),
    recommendedTests: report.recommendedTests.slice(0, 20)
  };
}

function formatLlmReviewError(
  error: unknown,
  provider: "disabled" | "ollama" | "litellm"
): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("llm.model") || message.includes("llm.endpoint")) {
    return new Error(`${message} Run "codedecay config --format markdown" to verify your llm settings.`);
  }

  if (message.includes("could not read API key from environment variable")) {
    return new Error(`${message} Export the configured variable, then rerun "codedecay llm-review --ping".`);
  }

  if (provider === "ollama" && /fetch support|ECONNREFUSED|request failed|abort/i.test(message)) {
    return new Error(`${message} Ensure Ollama is running at the configured endpoint and the model is available before rerunning "codedecay llm-review --ping".`);
  }

  if (provider === "litellm" && /request failed|401|403|404|message content|choices/i.test(message)) {
    return new Error(`${message} Verify the LiteLLM/OpenAI-compatible endpoint, model name, and API key configuration, then rerun "codedecay llm-review --ping".`);
  }

  return new Error(message);
}
