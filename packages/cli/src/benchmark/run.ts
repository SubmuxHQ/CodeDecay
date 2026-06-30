import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { RedteamReport } from "@submuxhq/codedecay-redteam";
import {
  createDefaultBenchmarkCorpus,
  type BenchmarkArea,
  type BenchmarkCorpus,
  type BenchmarkRuleExpectation,
  type BenchmarkScenario
} from "./corpus";
import type { BenchmarkOptions } from "../types";

export interface BenchmarkRuleMetrics {
  ruleId: string;
  area: BenchmarkArea;
  expected: number;
  matched: number;
  recall: number;
  falsePositives: number;
  falsePositiveRate: number;
  precision: number;
}

export interface BenchmarkAreaMetrics {
  area: BenchmarkArea;
  expected: number;
  matched: number;
  recall: number;
  falsePositives: number;
  precision: number;
}

export interface BenchmarkScenarioResult {
  id: string;
  kind: "positive" | "decoy";
  expectedRuleIds: string[];
  detectedRuleIds: string[];
  matchedRuleIds: string[];
  falsePositiveRuleIds: string[];
  llmCalled: boolean;
  telemetrySent: boolean;
}

export interface BenchmarkReport {
  corpus: string;
  timestamp: string;
  metrics: {
    byRuleId: BenchmarkRuleMetrics[];
    byArea: BenchmarkAreaMetrics[];
  };
  scenarios: BenchmarkScenarioResult[];
  summary: {
    totalExpected: number;
    totalMatched: number;
    overallRecall: number;
    falsePositives: number;
    falsePositiveRate: number;
    durationMs: number;
    costUsd: 0;
    llmCalled: boolean;
    telemetrySent: boolean;
  };
}

export interface BenchmarkDependencies {
  createRedteamReport(cwd: string): Promise<RedteamReport>;
  now?(): Date;
}

interface BenchmarkManifest {
  id?: string;
  rules: BenchmarkRuleExpectation[];
  positives: Array<{ id: string; path: string; expectedRuleIds: string[] }>;
  decoys?: Array<{ id: string; path: string }>;
}

export async function runBenchmark(
  options: BenchmarkOptions,
  dependencies: BenchmarkDependencies
): Promise<BenchmarkReport> {
  const startedAt = Date.now();
  const corpus = loadBenchmarkCorpus(options.corpus);

  try {
    const scenarioResults: BenchmarkScenarioResult[] = [];
    for (const scenario of corpus.scenarios) {
      const cwd = scenario.setup();
      const report = await dependencies.createRedteamReport(cwd);
      scenarioResults.push(createScenarioResult(scenario, report, corpus.rules));
    }

    const byRuleId = createRuleMetrics(corpus.rules, scenarioResults);
    const byArea = createAreaMetrics(byRuleId);
    const totalExpected = byRuleId.reduce((sum, rule) => sum + rule.expected, 0);
    const totalMatched = byRuleId.reduce((sum, rule) => sum + rule.matched, 0);
    const falsePositives = byRuleId.reduce((sum, rule) => sum + rule.falsePositives, 0);
    const decoyScenarioCount = scenarioResults.filter((scenario) => scenario.kind === "decoy").length;
    const falsePositiveChecks = corpus.rules.length * decoyScenarioCount;

    return {
      corpus: corpus.id,
      timestamp: (dependencies.now?.() ?? new Date()).toISOString(),
      metrics: {
        byRuleId,
        byArea
      },
      scenarios: scenarioResults,
      summary: {
        totalExpected,
        totalMatched,
        overallRecall: ratio(totalMatched, totalExpected),
        falsePositives,
        falsePositiveRate: ratio(falsePositives, falsePositiveChecks),
        durationMs: Date.now() - startedAt,
        costUsd: 0,
        llmCalled: scenarioResults.some((scenario) => scenario.llmCalled),
        telemetrySent: scenarioResults.some((scenario) => scenario.telemetrySent)
      }
    };
  } finally {
    corpus.cleanup();
  }
}

function loadBenchmarkCorpus(corpusOption: string | undefined): BenchmarkCorpus {
  if (!corpusOption || corpusOption === "default") {
    return createDefaultBenchmarkCorpus();
  }

  return loadManifestCorpus(corpusOption);
}

function loadManifestCorpus(corpusOption: string): BenchmarkCorpus {
  const manifestPath = resolveManifestPath(corpusOption);
  const manifest = parseManifest(manifestPath);
  const root = dirname(manifestPath);
  const rules = validateRules(manifest.rules);
  const positiveScenarios = manifest.positives.map((scenario) => createManifestScenario(root, scenario, "positive"));
  const decoyScenarios = (manifest.decoys ?? []).map((scenario) =>
    createManifestScenario(root, { ...scenario, expectedRuleIds: [] }, "decoy")
  );

  return {
    id: manifest.id ?? "custom",
    rules,
    scenarios: [...positiveScenarios, ...decoyScenarios],
    cleanup: () => {}
  };
}

function resolveManifestPath(corpusOption: string): string {
  const resolved = resolve(corpusOption);
  const manifestPath = resolved.endsWith(".json") ? resolved : resolve(resolved, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Benchmark corpus manifest not found: ${manifestPath}`);
  }

  return manifestPath;
}

function parseManifest(manifestPath: string): BenchmarkManifest {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<BenchmarkManifest>;
  if (!Array.isArray(parsed.rules) || !Array.isArray(parsed.positives)) {
    throw new Error("Benchmark corpus manifest must include rules[] and positives[].");
  }

  const manifest: BenchmarkManifest = {
    rules: parsed.rules,
    positives: parsed.positives,
    decoys: Array.isArray(parsed.decoys) ? parsed.decoys : []
  };

  if (typeof parsed.id === "string") {
    manifest.id = parsed.id;
  }

  return manifest;
}

function validateRules(rules: BenchmarkRuleExpectation[]): BenchmarkRuleExpectation[] {
  const validAreas = new Set<BenchmarkArea>(["security", "regression", "quality"]);
  return rules.map((rule) => {
    if (!rule.ruleId || !validAreas.has(rule.area)) {
      throw new Error("Benchmark rules must include ruleId and area: security, regression, or quality.");
    }

    return rule;
  });
}

function createManifestScenario(
  root: string,
  scenario: { id: string; path: string; expectedRuleIds: string[] },
  kind: "positive" | "decoy"
): BenchmarkScenario {
  if (!scenario.id || !scenario.path || !Array.isArray(scenario.expectedRuleIds)) {
    throw new Error("Benchmark scenarios must include id, path, and expectedRuleIds[].");
  }

  const scenarioPath = isAbsolute(scenario.path) ? scenario.path : resolve(root, scenario.path);
  return {
    id: scenario.id,
    kind,
    expectedRuleIds: scenario.expectedRuleIds,
    setup: () => scenarioPath
  };
}

function createScenarioResult(
  scenario: BenchmarkScenario,
  report: RedteamReport,
  rules: BenchmarkRuleExpectation[]
): BenchmarkScenarioResult {
  const expectedRuleSet = new Set(scenario.expectedRuleIds);
  const benchmarkRuleSet = new Set(rules.map((rule) => rule.ruleId));
  const detectedRuleIds = uniqueSorted(collectRuleIds(report));
  const matchedRuleIds = scenario.kind === "positive"
    ? detectedRuleIds.filter((ruleId) => expectedRuleSet.has(ruleId))
    : [];
  const falsePositiveRuleIds = scenario.kind === "decoy"
    ? detectedRuleIds.filter((ruleId) => benchmarkRuleSet.has(ruleId))
    : [];

  return {
    id: scenario.id,
    kind: scenario.kind,
    expectedRuleIds: scenario.expectedRuleIds,
    detectedRuleIds,
    matchedRuleIds,
    falsePositiveRuleIds,
    llmCalled: report.safety.llmCalled,
    telemetrySent: report.safety.telemetrySent
  };
}

function collectRuleIds(report: RedteamReport): string[] {
  return [
    ...report.analysis.findings.map((finding) => finding.ruleId),
    ...(report.analysis.securityCandidates ?? []).map((candidate) => candidate.ruleId)
  ];
}

function createRuleMetrics(
  rules: BenchmarkRuleExpectation[],
  scenarios: BenchmarkScenarioResult[]
): BenchmarkRuleMetrics[] {
  return rules.map((rule) => {
    const positiveScenarios = scenarios.filter((scenario) => scenario.kind === "positive");
    const decoyScenarios = scenarios.filter((scenario) => scenario.kind === "decoy");
    const expected = positiveScenarios.filter((scenario) => scenario.expectedRuleIds.includes(rule.ruleId)).length;
    const matched = positiveScenarios.filter((scenario) => scenario.expectedRuleIds.includes(rule.ruleId) && scenario.detectedRuleIds.includes(rule.ruleId)).length;
    const falsePositives = decoyScenarios.filter((scenario) => scenario.detectedRuleIds.includes(rule.ruleId)).length;

    return {
      ruleId: rule.ruleId,
      area: rule.area,
      expected,
      matched,
      recall: ratio(matched, expected),
      falsePositives,
      falsePositiveRate: ratio(falsePositives, decoyScenarios.length),
      precision: ratio(matched, matched + falsePositives)
    };
  });
}

function createAreaMetrics(ruleMetrics: BenchmarkRuleMetrics[]): BenchmarkAreaMetrics[] {
  const areas: BenchmarkArea[] = ["security", "regression", "quality"];
  return areas.map((area) => {
    const rules = ruleMetrics.filter((rule) => rule.area === area);
    const expected = rules.reduce((sum, rule) => sum + rule.expected, 0);
    const matched = rules.reduce((sum, rule) => sum + rule.matched, 0);
    const falsePositives = rules.reduce((sum, rule) => sum + rule.falsePositives, 0);

    return {
      area,
      expected,
      matched,
      recall: ratio(matched, expected),
      falsePositives,
      precision: ratio(matched, matched + falsePositives)
    };
  });
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 1;
  }

  return Number((numerator / denominator).toFixed(4));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
