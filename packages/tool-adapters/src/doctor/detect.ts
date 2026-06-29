import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getExternalTool } from "./registry";
import type { DoctorReport, DoctorSignal, ToolRecommendation, ToolRecommendationPriority } from "./types";

interface PackageJsonShape {
  packageManager?: string | undefined;
  scripts?: Record<string, string> | undefined;
  dependencies?: Record<string, string> | undefined;
  devDependencies?: Record<string, string> | undefined;
  optionalDependencies?: Record<string, string> | undefined;
}

export function createDoctorReport(cwd: string): DoctorReport {
  const signals = detectDoctorSignals(cwd);
  const recommendations = createToolRecommendations(cwd, signals);

  return {
    tool: "CodeDecay",
    cwd,
    signals,
    recommendations,
    safety: {
      commandsExecuted: false,
      toolsInstalled: false,
      networkUsed: false,
      llmCalled: false,
      telemetrySent: false
    }
  };
}

export function detectDoctorSignals(cwd: string): DoctorSignal[] {
  const signals: DoctorSignal[] = [];
  const packageJson = readPackageJson(cwd);
  const dependencies = packageJson ? dependencyNames(packageJson) : new Set<string>();

  if (packageJson) {
    signals.push({ kind: "language", value: "javascript-typescript", source: "package.json" });
    const manager = packageJson.packageManager?.split("@", 1)[0] ?? lockfilePackageManager(cwd);
    if (manager) {
      signals.push({
        kind: "package-manager",
        value: manager,
        source: packageJson.packageManager ? "package.json#packageManager" : "lockfile"
      });
    }

    for (const runner of detectTestRunners(packageJson, dependencies)) {
      signals.push(runner);
    }
  }

  signals.push(...detectFrameworks(cwd, dependencies));
  signals.push(...detectApiSchemas(cwd));
  signals.push(...detectToolConfigs(cwd, dependencies));

  if (existsSync(join(cwd, ".github", "workflows"))) {
    signals.push({ kind: "ci", value: "github-actions", source: ".github/workflows" });
  }

  return dedupeSignals(signals);
}

export function createToolRecommendations(cwd: string, signals: DoctorSignal[]): ToolRecommendation[] {
  const recommendations: ToolRecommendation[] = [];
  const packageJson = readPackageJson(cwd);
  const scripts = packageJson?.scripts ?? {};
  const hasJs = hasSignal(signals, "language", "javascript-typescript");
  const hasApi = hasSignalKind(signals, "api-schema") || hasFramework(signals, ["express", "fastify", "nextjs"]);
  const hasUi = hasFramework(signals, ["nextjs", "react", "vite"]);
  const hasTests = hasSignalKind(signals, "test-runner") || Boolean(scripts.test);
  const packageManager = signals.find((signal) => signal.kind === "package-manager")?.value ?? "pnpm";
  const openApiSignal = signals.find((signal) => signal.kind === "api-schema" && signal.value === "openapi");

  if (hasJs) {
    pushRecommendation(recommendations, {
      id: "semgrep",
      priority: "high",
      reason: "Use Semgrep for local static bug and security rules instead of adding CodeDecay-only scanners.",
      signals,
      configPreview: ["toolAdapters:", "  semgrep:", "    config: .semgrep.yml"].join("\n")
    });
  }

  if (hasUi) {
    pushRecommendation(recommendations, {
      id: "playwright",
      priority: "high",
      reason: "UI or frontend routes were detected; Playwright can exercise real user flows that unit tests often miss.",
      signals,
      configPreview: ["toolAdapters:", "  playwright:", "    command: pnpm exec playwright test"].join("\n")
    });
  }

  if (openApiSignal) {
    pushRecommendation(recommendations, {
      id: "schemathesis",
      priority: "high",
      reason: "An OpenAPI schema was found; Schemathesis can fuzz real API edge cases from the schema.",
      signals: [openApiSignal],
      configPreview: [
        "toolAdapters:",
        "  schemathesis:",
        `    schema: ${openApiSignal.source}`,
        "    baseUrl: http://127.0.0.1:3000"
      ].join("\n")
    });
  } else if (hasApi) {
    pushRecommendation(recommendations, {
      id: "schemathesis",
      priority: "medium",
      reason: "API code was detected; add or point CodeDecay at an OpenAPI/GraphQL schema to enable API fuzzing.",
      signals
    });
  }

  if (hasTests && hasJs) {
    pushRecommendation(recommendations, {
      id: "stryker",
      priority: "medium",
      reason: "Tests were detected; StrykerJS can reveal tests that pass while mutations survive.",
      signals,
      configPreview: [
        "toolAdapters:",
        "  stryker:",
        "    command: pnpm exec stryker run",
        "    reportPath: reports/mutation/mutation.json"
      ].join("\n")
    });
    pushRecommendation(recommendations, {
      id: "coverage",
      priority: "medium",
      reason: "Tests were detected; coverage artifacts help CodeDecay separate tested behavior from unproven changes.",
      signals,
      configPreview: [
        "toolAdapters:",
        "  coverage:",
        "    command: pnpm test -- --coverage",
        "    reportPaths:",
        "      - coverage/coverage-final.json",
        "      - coverage/lcov.info"
      ].join("\n")
    });
  }

  if (hasApi || hasSignal(signals, "tool-config", "pact")) {
    pushRecommendation(recommendations, {
      id: "pact",
      priority: hasSignal(signals, "tool-config", "pact") ? "high" : "low",
      reason: "API/service boundaries were detected; Pact can catch provider/consumer compatibility regressions.",
      signals,
      configPreview: ["toolAdapters:", "  pact:", "    command: pnpm run test:pact"].join("\n")
    });
  }

  if (hasJs || lockfilePackageManager(cwd)) {
    const lockfile = lockfileForPackageManager(cwd, packageManager);
    pushRecommendation(recommendations, {
      id: "osv-scanner",
      priority: "medium",
      reason: "A package manifest or lockfile was detected; OSV-Scanner can add dependency vulnerability evidence.",
      signals,
      configPreview: lockfile ? `# External check suggestion: osv-scanner --lockfile ${lockfile}` : undefined
    });
  }

  if (hasSignalKind(signals, "ci")) {
    pushRecommendation(recommendations, {
      id: "openssf-scorecard",
      priority: "low",
      reason: "GitHub Actions were detected; OpenSSF Scorecard can review repository supply-chain hardening.",
      signals
    });
  }

  return recommendations.sort(
    (left, right) => priorityRank(right.priority) - priorityRank(left.priority) || left.tool.name.localeCompare(right.tool.name)
  );
}

export function renderConfigPreview(report: DoctorReport): string {
  const adapterPreviews = report.recommendations
    .map((recommendation) => recommendation.configPreview)
    .filter((preview): preview is string => Boolean(preview))
    .filter((preview) => preview.startsWith("toolAdapters:"));
  const externalNotes = report.recommendations
    .map((recommendation) => recommendation.configPreview)
    .filter((preview): preview is string => Boolean(preview))
    .filter((preview) => !preview.startsWith("toolAdapters:"));

  const lines = [
    "# Generated by codedecay doctor.",
    "# Review before copying anything into .codedecay/config.yml.",
    "version: 1",
    "",
    "safety:",
    "  allowCommands: false",
    ""
  ];

  if (adapterPreviews.length === 0) {
    lines.push("toolAdapters: {}", "");
  } else {
    lines.push("toolAdapters:");
    const seen = new Set<string>();
    for (const preview of adapterPreviews) {
      for (const line of preview.split(/\r?\n/).slice(1)) {
        if (seen.has(line)) {
          continue;
        }
        seen.add(line);
        lines.push(line);
      }
    }
    lines.push("");
  }

  lines.push(...externalNotes);
  if (externalNotes.length > 0) {
    lines.push("");
  }

  lines.push("# CodeDecay does not install or run these tools from doctor.", "");
  return lines.join("\n");
}

function pushRecommendation(
  recommendations: ToolRecommendation[],
  input: {
    id: string;
    priority: ToolRecommendationPriority;
    reason: string;
    signals: DoctorSignal[];
    configPreview?: string | undefined;
  }
): void {
  const tool = getExternalTool(input.id);
  if (!tool) {
    return;
  }

  const recommendation: ToolRecommendation = {
    tool,
    priority: input.priority,
    reason: input.reason,
    matchedSignals: input.signals.slice(0, 8)
  };

  if (input.configPreview) {
    recommendation.configPreview = input.configPreview;
  }

  recommendations.push(recommendation);
}

function readPackageJson(cwd: string): PackageJsonShape | undefined {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonShape;
  } catch {
    return undefined;
  }
}

function dependencyNames(packageJson: PackageJsonShape): Set<string> {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {})
  ]);
}

function detectFrameworks(cwd: string, dependencies: Set<string>): DoctorSignal[] {
  const signals: DoctorSignal[] = [];
  const dependencyChecks: Array<[string, string]> = [
    ["next", "nextjs"],
    ["react", "react"],
    ["vite", "vite"],
    ["express", "express"],
    ["fastify", "fastify"]
  ];

  for (const [dependency, value] of dependencyChecks) {
    if (dependencies.has(dependency)) {
      signals.push({ kind: "framework", value, source: `package.json dependency ${dependency}` });
    }
  }

  const pathChecks: Array<[string, string]> = [
    ["app", "nextjs"],
    ["pages", "nextjs"],
    ["src/app", "nextjs"],
    ["src/pages", "nextjs"],
    ["src/routes", "node-routes"],
    ["routes", "node-routes"]
  ];

  for (const [path, value] of pathChecks) {
    if (existsSync(join(cwd, path))) {
      signals.push({ kind: "framework", value, source: path });
    }
  }

  return signals;
}

function detectTestRunners(packageJson: PackageJsonShape, dependencies: Set<string>): DoctorSignal[] {
  const signals: DoctorSignal[] = [];
  const scripts = packageJson.scripts ?? {};
  const scriptText = Object.entries(scripts).map(([name, command]) => `${name}:${command}`).join("\n");
  const runnerChecks: Array<[string, RegExp]> = [
    ["vitest", /\bvitest\b/],
    ["jest", /\bjest\b/],
    ["playwright", /\bplaywright\b/],
    ["bun-test", /\bbun\s+test\b/],
    ["node-test", /\bnode\s+--test\b/]
  ];

  for (const [runner, pattern] of runnerChecks) {
    if (pattern.test(scriptText) || dependencies.has(runner) || dependencies.has(`@${runner}/test`)) {
      signals.push({ kind: "test-runner", value: runner, source: "package.json scripts/dependencies" });
    }
  }

  if (scripts.test && signals.length === 0) {
    signals.push({ kind: "test-runner", value: "configured-test-script", source: "package.json#scripts.test" });
  }

  return signals;
}

function detectApiSchemas(cwd: string): DoctorSignal[] {
  const candidates = [
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "docs/openapi.yaml",
    "docs/openapi.yml",
    "docs/openapi.json",
    "schema/openapi.yaml",
    "schema/openapi.yml",
    "schema/openapi.json"
  ];

  return candidates
    .filter((path) => existsSync(join(cwd, path)))
    .map((path) => ({ kind: "api-schema" as const, value: "openapi", source: path }));
}

function detectToolConfigs(cwd: string, dependencies: Set<string>): DoctorSignal[] {
  const signals: DoctorSignal[] = [];
  const configChecks: Array<[string, string[]]> = [
    ["semgrep", [".semgrep.yml", ".semgrep.yaml"]],
    ["playwright", ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"]],
    ["stryker", ["stryker.conf.js", "stryker.conf.mjs", "stryker.conf.json", "stryker.config.js"]],
    ["pact", ["pact.config.js", "pact.config.ts"]],
    ["coverage", ["coverage", ".nyc_output"]]
  ];

  for (const [tool, paths] of configChecks) {
    const source = paths.find((path) => existsSync(join(cwd, path)));
    if (source) {
      signals.push({ kind: "tool-config", value: tool, source });
    }
  }

  if (dependencies.has("@playwright/test") || dependencies.has("playwright")) {
    signals.push({ kind: "tool-config", value: "playwright", source: "package.json dependency" });
  }
  if ([...dependencies].some((dependency) => dependency.startsWith("@stryker-mutator/"))) {
    signals.push({ kind: "tool-config", value: "stryker", source: "package.json dependency" });
  }
  if ([...dependencies].some((dependency) => dependency.includes("pact"))) {
    signals.push({ kind: "tool-config", value: "pact", source: "package.json dependency" });
  }

  return signals;
}

function lockfilePackageManager(cwd: string): string | undefined {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return undefined;
}

function lockfileForPackageManager(cwd: string, manager: string): string | undefined {
  const candidates = manager === "pnpm"
    ? ["pnpm-lock.yaml"]
    : manager === "bun"
      ? ["bun.lock", "bun.lockb"]
      : manager === "yarn"
        ? ["yarn.lock"]
        : ["package-lock.json"];

  return candidates.find((candidate) => existsSync(join(cwd, candidate)));
}

function hasSignal(signals: DoctorSignal[], kind: DoctorSignal["kind"], value: string): boolean {
  return signals.some((signal) => signal.kind === kind && signal.value === value);
}

function hasSignalKind(signals: DoctorSignal[], kind: DoctorSignal["kind"]): boolean {
  return signals.some((signal) => signal.kind === kind);
}

function hasFramework(signals: DoctorSignal[], frameworks: string[]): boolean {
  return signals.some((signal) => signal.kind === "framework" && frameworks.includes(signal.value));
}

function priorityRank(priority: ToolRecommendationPriority): number {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function dedupeSignals(signals: DoctorSignal[]): DoctorSignal[] {
  const seen = new Set<string>();
  const deduped: DoctorSignal[] = [];

  for (const signal of signals) {
    const key = `${signal.kind}:${signal.value}:${signal.source}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(signal);
  }

  return deduped.sort((left, right) => `${left.kind}:${left.value}:${left.source}`.localeCompare(`${right.kind}:${right.value}:${right.source}`));
}
