import {
  CODEDECAY_VERSION,
  dedupeStrings,
  isTestFilePath,
  normalizeRequirementContext
} from "@submuxhq/codedecay-core";
import type { DesignMatcher, RequirementContext } from "@submuxhq/codedecay-core";
import type { AgentSuggestedCheck } from "../types";
import type {
  AgentPreflightArea,
  AgentPreflightAreaKind,
  AgentPreflightCandidateFile,
  AgentPreflightCandidateRoute,
  AgentPreflightConfidence,
  AgentPreflightConfigInput,
  AgentPreflightDesignConstraint,
  AgentPreflightEvidence,
  AgentPreflightMemoryEvidence,
  AgentPreflightMemoryInput,
  AgentPreflightMemoryMatch,
  AgentPreflightReport,
  AgentPreflightSuggestions,
  CreateAgentPreflightReportOptions
} from "./types";

const AREA_NAMES: Record<AgentPreflightAreaKind, string> = {
  api: "API and route behavior",
  ui: "UI and user-flow behavior",
  database: "Database and persistence behavior",
  auth: "Authentication and authorization behavior",
  config: "Configuration, CI, and environment behavior",
  test: "Tests and proof quality",
  source: "Shared source behavior",
  docs: "Documentation and developer guidance"
};

const AREA_KEYWORDS: Record<AgentPreflightAreaKind, string[]> = {
  api: ["api", "endpoint", "route", "request", "response", "controller", "handler", "openapi", "swagger", "graphql"],
  ui: ["ui", "page", "screen", "component", "form", "button", "dashboard", "browser", "playwright", "frontend"],
  database: ["db", "database", "migration", "schema", "prisma", "sql", "query", "postgres", "table", "transaction"],
  auth: ["auth", "login", "logout", "session", "token", "jwt", "oauth", "permission", "role", "access"],
  config: ["config", "env", "workflow", "ci", "action", "deploy", "docker", "package", "tsconfig", "vite", "webpack"],
  test: ["test", "spec", "coverage", "vitest", "jest", "playwright", "assert", "mock", "snapshot", "regression"],
  source: ["service", "module", "helper", "library", "refactor", "logic", "function", "class"],
  docs: ["docs", "readme", "guide", "markdown", "documentation", "adr", "rfc"]
};

const MAX_TASK_TOKENS = 24;
const MAX_CANDIDATE_FILES = 24;
const MAX_CANDIDATE_ROUTES = 16;
const MAX_MEMORY_MATCHES_PER_SECTION = 8;
const MAX_DESIGN_CONSTRAINTS = 16;
const GENERIC_SCOPE_TOKENS = new Set([
  "add",
  "api",
  "change",
  "component",
  "create",
  "endpoint",
  "fix",
  "function",
  "handler",
  "implement",
  "logic",
  "module",
  "page",
  "refactor",
  "request",
  "response",
  "route",
  "service",
  "source",
  "test",
  "tests",
  "update",
  "user"
]);

export function createAgentPreflightReport(options: CreateAgentPreflightReportOptions): AgentPreflightReport {
  const task = options.task.trim();
  if (!task) {
    throw new Error("agent preflight requires --task <description>.");
  }

  let requirements = normalizeRequirementContext({
    task,
    context: options.requirements,
    source: options.requirementSource ?? {
      id: "task-input",
      kind: "task",
      label: "Agent preflight task"
    }
  });
  const tokens = tokenize(requirementSearchText(requirements));
  const scopeTokens = tokenize(requirementScopeText(requirements));
  const keywordMatches = collectKeywordMatches(tokens);
  const likelyAreas = collectLikelyAreas(keywordMatches, tokens);
  const candidateFiles = collectCandidateFiles(options.repoFiles, likelyAreas, scopeTokens);
  if (candidateFiles.length === 0 && requirements.unresolvedQuestions.length === 0) {
    requirements = {
      ...requirements,
      unresolvedQuestions: [
        {
          text: `Which repository path implements ${strongScopeTokens(scopeTokens).slice(0, 4).join(" / ") || "this requirement"}?`,
          sourceIds: [requirements.task.sourceIds[0] ?? "task-input"]
        }
      ]
    };
  }
  const candidateRoutes = collectCandidateRoutes(candidateFiles, options.config, scopeTokens);
  const configuredChecks = collectConfiguredChecks(options.config);
  const memory = collectMemoryEvidence(options.memory, likelyAreas, candidateFiles, candidateRoutes, tokens);
  const designConstraints = collectDesignConstraints(options.config, likelyAreas, candidateFiles, candidateRoutes, tokens);
  const deterministicEvidence = createEvidence({
    rootDir: options.rootDir,
    configSource: options.configSource,
    memorySource: options.memorySource,
    tokens,
    keywordMatches,
    likelyAreas,
    candidateFiles,
    candidateRoutes,
    memory,
    designConstraints,
    configuredChecks
  });
  const suggestions = createSuggestions({
    task,
    likelyAreas,
    candidateFiles,
    candidateRoutes,
    memory,
    configuredChecks
  });

  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "agent-preflight",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    task,
    requirements,
    summary: {
      confidence: confidenceFor(
        likelyAreas.length,
        candidateFiles.length,
        memoryCount(memory),
        requirements.confidence
      ),
      likelyAreas: likelyAreas.length,
      candidateFiles: candidateFiles.length,
      candidateRoutes: candidateRoutes.length,
      memoryMatches: memoryCount(memory),
      designConstraints: designConstraints.length,
      configuredChecks: configuredChecks.length,
      acceptanceCriteria: requirements.acceptanceCriteria.length,
      unresolvedQuestions: requirements.unresolvedQuestions.length,
      insufficientContext: candidateFiles.length === 0
    },
    deterministicEvidence,
    suggestions,
    safety: {
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      agentOutputTrusted: false
    },
    limits: [
      "Preflight does not inspect a PR diff; file and route candidates require domain-specific task terms or stronger repo evidence.",
      "Preflight does not execute configured commands, open browsers, call models, install tools, or send telemetry.",
      "Memory and docs are treated as review context, not trusted executable instruction.",
      "Use the proof plan as a starting point, then verify with real tests, configured checks, or product/runtime evidence."
    ]
  };
}

function createEvidence(input: {
  rootDir: string;
  configSource?: string | undefined;
  memorySource?: string | undefined;
  tokens: string[];
  keywordMatches: { area: AgentPreflightAreaKind; keywords: string[] }[];
  likelyAreas: AgentPreflightArea[];
  candidateFiles: AgentPreflightCandidateFile[];
  candidateRoutes: AgentPreflightCandidateRoute[];
  memory: AgentPreflightMemoryEvidence;
  designConstraints: AgentPreflightDesignConstraint[];
  configuredChecks: AgentSuggestedCheck[];
}): AgentPreflightEvidence {
  const evidence: AgentPreflightEvidence = {
    rootDir: input.rootDir,
    taskSignals: {
      tokens: input.tokens,
      matchedKeywords: input.keywordMatches,
      noDiffRequired: true
    },
    likelyAreas: input.likelyAreas,
    candidateFiles: input.candidateFiles,
    candidateRoutes: input.candidateRoutes,
    memory: input.memory,
    designConstraints: input.designConstraints,
    configuredChecks: input.configuredChecks
  };

  if (input.configSource) {
    evidence.configSource = input.configSource;
  }

  if (input.memorySource) {
    evidence.memorySource = input.memorySource;
  }

  return evidence;
}

function collectKeywordMatches(tokens: string[]): { area: AgentPreflightAreaKind; keywords: string[] }[] {
  return Object.entries(AREA_KEYWORDS)
    .map(([area, keywords]) => ({
      area: area as AgentPreflightAreaKind,
      keywords: keywords.filter((keyword) => tokens.includes(keyword))
    }))
    .filter((match) => match.keywords.length > 0);
}

function collectLikelyAreas(
  keywordMatches: { area: AgentPreflightAreaKind; keywords: string[] }[],
  tokens: string[]
): AgentPreflightArea[] {
  const matches = keywordMatches.map((match) => ({
    kind: match.area,
    name: AREA_NAMES[match.area],
    confidence: match.keywords.length >= 2 ? "high" as const : "medium" as const,
    reasons: [`Task mentions ${match.keywords.map((keyword) => `\`${keyword}\``).join(", ")}.`]
  }));

  if (matches.length === 0) {
    return [
      {
        kind: "source",
        name: AREA_NAMES.source,
        confidence: tokens.length > 0 ? "low" : "medium",
        reasons: ["No specialized API/UI/config/test keywords matched; treat this as shared source work until the agent narrows scope."]
      }
    ];
  }

  return sortAreas(matches);
}

function sortAreas(areas: AgentPreflightArea[]): AgentPreflightArea[] {
  return [...areas].sort((left, right) => {
    const byConfidence = confidenceRank(right.confidence) - confidenceRank(left.confidence);
    if (byConfidence !== 0) {
      return byConfidence;
    }

    return left.kind.localeCompare(right.kind);
  });
}

function collectCandidateFiles(
  repoFiles: string[],
  likelyAreas: AgentPreflightArea[],
  tokens: string[]
): AgentPreflightCandidateFile[] {
  const scored = repoFiles
    .filter(isPreflightRepoFile)
    .map((path) => scoreCandidateFile(path, likelyAreas, tokens))
    .filter((candidate): candidate is AgentPreflightCandidateFile & { score: number } => candidate !== undefined)
    .sort((left, right) =>
      right.score - left.score ||
      Number(isTestFilePath(left.path)) - Number(isTestFilePath(right.path)) ||
      left.path.localeCompare(right.path)
    );

  return scored.slice(0, MAX_CANDIDATE_FILES).map(({ score: _score, ...candidate }) => candidate);
}

function isPreflightRepoFile(path: string): boolean {
  return !(
    path.startsWith(".codedecay/local/") ||
    path.includes("/.codedecay/local/") ||
    path.startsWith("docs/.vitepress/cache/") ||
    path.startsWith("docs/.vitepress/dist/")
  );
}

function scoreCandidateFile(
  path: string,
  likelyAreas: AgentPreflightArea[],
  tokens: string[]
): (AgentPreflightCandidateFile & { score: number }) | undefined {
  const normalizedPath = path.toLowerCase();
  const pathAreas = pathAreasFor(path);
  const tokenHits = strongScopeTokens(tokens).filter((token) => normalizedPath.includes(token));
  if (tokenHits.length === 0) {
    return undefined;
  }

  const reasons: string[] = [];
  let score = Math.min(tokenHits.length * 4, 16);
  reasons.push(`Path includes requirement term(s): ${tokenHits.slice(0, 5).join(", ")}.`);

  for (const area of likelyAreas) {
    if (pathAreas.includes(area.kind)) {
      score += area.confidence === "high" ? 5 : 4;
      reasons.push(`Path matches likely ${area.kind} work.`);
    }
  }

  if (pathAreas.includes("test") && likelyAreas.some((area) => area.kind === "test")) {
    score += 4;
    reasons.push("Task asks for test or proof work and this is a test path.");
  }

  if (score === 0) {
    return undefined;
  }

  return {
    path,
    areas: pathAreas.length > 0 ? pathAreas : ["source"],
    reasons: dedupeStrings(reasons),
    score
  };
}

function pathAreasFor(path: string): AgentPreflightAreaKind[] {
  const normalized = path.toLowerCase();
  const areas: AgentPreflightAreaKind[] = [];

  if (
    normalized.includes("/api/") ||
    normalized.includes("/routes/") ||
    normalized.includes("/controllers/") ||
    normalized.endsWith("/route.ts") ||
    normalized.endsWith("/route.tsx") ||
    normalized.includes("openapi") ||
    normalized.includes("swagger")
  ) {
    areas.push("api");
  }

  if (
    normalized.endsWith(".tsx") ||
    normalized.includes("/components/") ||
    normalized.includes("/views/") ||
    normalized.includes("/screens/") ||
    normalized.includes("/pages/") ||
    normalized.includes("/app/")
  ) {
    areas.push("ui");
  }

  if (
    normalized.includes("/db/") ||
    normalized.includes("/database/") ||
    normalized.includes("/migrations/") ||
    normalized.includes("schema") ||
    normalized.includes("prisma") ||
    normalized.endsWith(".sql")
  ) {
    areas.push("database");
  }

  if (
    normalized.includes("/auth/") ||
    normalized.includes("session") ||
    normalized.includes("token") ||
    normalized.includes("permission") ||
    normalized.includes("role")
  ) {
    areas.push("auth");
  }

  if (isConfigPath(normalized)) {
    areas.push("config");
  }

  if (isTestFilePath(normalized) || normalized.includes("playwright")) {
    areas.push("test");
  }

  if (normalized.endsWith(".md") || normalized.startsWith("docs/") || normalized.includes("/docs/")) {
    areas.push("docs");
  }

  if (areas.length === 0 && (normalized.startsWith("src/") || normalized.startsWith("packages/"))) {
    areas.push("source");
  }

  return dedupeStrings(areas) as AgentPreflightAreaKind[];
}

function collectCandidateRoutes(
  candidateFiles: AgentPreflightCandidateFile[],
  config: AgentPreflightConfigInput | undefined,
  tokens: string[]
): AgentPreflightCandidateRoute[] {
  const routes: AgentPreflightCandidateRoute[] = [];

  for (const file of candidateFiles) {
    const derived = routeFromFile(file.path);
    if (derived) {
      routes.push(derived);
    }
  }

  for (const [targetId, target] of Object.entries(config?.productTesting?.targets ?? {})) {
    for (const endpoint of target?.apiEndpoints ?? []) {
      const endpointText = `${endpoint.id ?? ""} ${endpoint.path}`.toLowerCase();
      const matchedTerms = strongScopeTokens(tokens).filter((token) => endpointText.includes(token));
      if (matchedTerms.length === 0) {
        continue;
      }
      routes.push({
        route: endpoint.path,
        kind: "product-api",
        methods: [endpoint.method.toUpperCase()],
        files: [],
        reasons: [
          `Configured product target \`${targetId}\` includes endpoint \`${endpoint.id ?? endpoint.path}\`.`,
          `Endpoint includes requirement term(s): ${matchedTerms.slice(0, 5).join(", ")}.`
        ]
      });
    }
  }

  return mergeRoutes(routes).slice(0, MAX_CANDIDATE_ROUTES);
}

function routeFromFile(path: string): AgentPreflightCandidateRoute | undefined {
  const appApiRoute = path.match(/(?:^|\/)app\/api\/(.+)\/route\.[cm]?[jt]sx?$/);
  if (appApiRoute?.[1]) {
    return {
      route: `/api/${routePathFromSegments(appApiRoute[1])}`,
      kind: "api-route",
      methods: [],
      files: [path],
      reasons: ["Next.js app router API route file matched the task."]
    };
  }

  const pagesApiRoute = path.match(/(?:^|\/)pages\/api\/(.+)\.[cm]?[jt]sx?$/);
  if (pagesApiRoute?.[1]) {
    return {
      route: `/api/${routePathFromSegments(pagesApiRoute[1])}`,
      kind: "api-route",
      methods: [],
      files: [path],
      reasons: ["Next.js pages API route file matched the task."]
    };
  }

  const appPageRoute = path.match(/(?:^|\/)app\/(.+)\/page\.[cm]?[jt]sx?$/);
  if (appPageRoute?.[1]) {
    return {
      route: `/${routePathFromSegments(appPageRoute[1])}`,
      kind: "ui-route",
      methods: [],
      files: [path],
      reasons: ["Next.js app router page file matched the task."]
    };
  }

  const pagesRoute = path.match(/(?:^|\/)pages\/(.+)\.[cm]?[jt]sx?$/);
  if (pagesRoute?.[1] && !pagesRoute[1].startsWith("api/")) {
    return {
      route: `/${routePathFromSegments(pagesRoute[1])}`,
      kind: "ui-route",
      methods: [],
      files: [path],
      reasons: ["Next.js pages route file matched the task."]
    };
  }

  return undefined;
}

function routePathFromSegments(value: string): string {
  return value
    .replace(/\/index$/, "")
    .replaceAll("[", ":")
    .replaceAll("]", "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/") || "";
}

function mergeRoutes(routes: AgentPreflightCandidateRoute[]): AgentPreflightCandidateRoute[] {
  const merged = new Map<string, AgentPreflightCandidateRoute>();
  for (const route of routes) {
    const key = `${route.kind}:${route.methods.join(",")}:${route.route}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...route, files: dedupeStrings(route.files), reasons: dedupeStrings(route.reasons) });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
  }

  return [...merged.values()].sort((left, right) => left.route.localeCompare(right.route));
}

function collectConfiguredChecks(config: AgentPreflightConfigInput | undefined): AgentSuggestedCheck[] {
  const checks: AgentSuggestedCheck[] = [];

  for (const [kind, commands] of Object.entries(config?.commands ?? {})) {
    for (const command of commands ?? []) {
      checks.push({
        source: "configured-command",
        kind,
        name: `${kind} command`,
        command,
        willRun: false
      });
    }
  }

  for (const probe of config?.probes ?? []) {
    checks.push({
      source: "configured-command",
      kind: "probe",
      name: probe.name,
      command: probe.command,
      willRun: false
    });
  }

  for (const [kind, adapter] of Object.entries(config?.toolAdapters ?? {})) {
    if (!adapter?.enabled || !adapter.command) {
      continue;
    }

    checks.push({
      source: "tool-adapter",
      kind,
      name: `${kind} adapter`,
      command: adapter.command,
      willRun: false
    });
  }

  return checks;
}

function collectMemoryEvidence(
  memory: AgentPreflightMemoryInput | undefined,
  likelyAreas: AgentPreflightArea[],
  candidateFiles: AgentPreflightCandidateFile[],
  candidateRoutes: AgentPreflightCandidateRoute[],
  tokens: string[]
): AgentPreflightMemoryEvidence {
  return {
    flows: (memory?.flows ?? [])
      .map((entry) => memoryMatch(entry, entry.name, entry.description, likelyAreas, candidateFiles, candidateRoutes, tokens))
      .filter(isDefined)
      .slice(0, MAX_MEMORY_MATCHES_PER_SECTION),
    commands: (memory?.commands ?? [])
      .map((entry) => {
        const match = memoryMatch(entry, entry.name, entry.description, likelyAreas, candidateFiles, candidateRoutes, tokens);
        return match ? { ...match, command: entry.command } : undefined;
      })
      .filter(isDefined)
      .slice(0, MAX_MEMORY_MATCHES_PER_SECTION),
    invariants: (memory?.invariants ?? [])
      .map((entry) => {
        const match = memoryMatch(entry, entry.name, entry.description, likelyAreas, candidateFiles, candidateRoutes, tokens);
        return match ? { ...match, severity: entry.severity } : undefined;
      })
      .filter(isDefined)
      .slice(0, MAX_MEMORY_MATCHES_PER_SECTION),
    architecture: (memory?.architecture ?? [])
      .map((entry) => memoryMatch(entry, entry.title, entry.note, likelyAreas, candidateFiles, candidateRoutes, tokens))
      .filter(isDefined)
      .slice(0, MAX_MEMORY_MATCHES_PER_SECTION),
    regressions: (memory?.regressions ?? [])
      .map((entry) => {
        const match = memoryMatch(entry, entry.title, entry.description, likelyAreas, candidateFiles, candidateRoutes, tokens);
        return match ? { ...match, severity: entry.severity } : undefined;
      })
      .filter(isDefined)
      .slice(0, MAX_MEMORY_MATCHES_PER_SECTION)
  };
}

function memoryMatch(
  entry: DesignMatcher,
  title: string,
  description: string | undefined,
  likelyAreas: AgentPreflightArea[],
  candidateFiles: AgentPreflightCandidateFile[],
  candidateRoutes: AgentPreflightCandidateRoute[],
  tokens: string[]
): AgentPreflightMemoryMatch | undefined {
  const reasons = matcherReasons(entry, likelyAreas, candidateFiles, candidateRoutes);
  const textHits = tokens.filter((token) => token.length >= 4 && `${title} ${description ?? ""}`.toLowerCase().includes(token));
  if (textHits.length > 0) {
    reasons.push(`Text mentions task term(s): ${textHits.slice(0, 5).join(", ")}.`);
  }

  if (reasons.length === 0) {
    return undefined;
  }

  const match: AgentPreflightMemoryMatch = {
    title,
    matchReasons: dedupeStrings(reasons)
  };

  if (description) {
    match.description = description;
  }

  return match;
}

function collectDesignConstraints(
  config: AgentPreflightConfigInput | undefined,
  likelyAreas: AgentPreflightArea[],
  candidateFiles: AgentPreflightCandidateFile[],
  candidateRoutes: AgentPreflightCandidateRoute[],
  tokens: string[]
): AgentPreflightDesignConstraint[] {
  const contract = config?.designContract;
  if (!contract) {
    return [];
  }

  const constraints: AgentPreflightDesignConstraint[] = [];

  for (const fence of contract.scopeFences ?? []) {
    const reasons = matcherReasons(fence, likelyAreas, candidateFiles, candidateRoutes);
    if (contract.activeScopeFence === fence.id) {
      reasons.push("This is the active scope fence.");
    }
    addTextReason(reasons, tokens, fence.id, fence.name, fence.message);
    if (reasons.length > 0) {
      constraints.push({
        kind: "scope-fence",
        id: fence.id,
        name: fence.name,
        severity: fence.severity,
        message: fence.message,
        allowedFiles: fence.allowedFiles,
        allowedAreas: fence.allowedAreas,
        files: fence.files,
        areas: fence.areas,
        productPaths: fence.productPaths,
        reason: dedupeStrings(reasons).join(" ")
      });
    }
  }

  for (const rule of contract.boundaryRules ?? []) {
    const reasons = matcherReasons(rule.from, likelyAreas, candidateFiles, candidateRoutes);
    addTextReason(reasons, tokens, rule.id, rule.name, rule.message, rule.rewrite);
    if (reasons.length > 0) {
      constraints.push({
        kind: "boundary-rule",
        id: rule.id,
        name: rule.name,
        severity: rule.severity,
        message: rule.message,
        rewrite: rule.rewrite,
        files: rule.from.files,
        areas: rule.from.areas,
        productPaths: rule.from.productPaths,
        reason: dedupeStrings(reasons).join(" ")
      });
    }
  }

  for (const rule of contract.dependencyRules ?? []) {
    const reasons = matcherReasons(rule, likelyAreas, candidateFiles, candidateRoutes);
    addTextReason(reasons, tokens, rule.id, rule.name, rule.message);
    if (reasons.length > 0) {
      constraints.push({
        kind: "dependency-rule",
        id: rule.id,
        name: rule.name,
        severity: rule.severity,
        message: rule.message,
        files: rule.files,
        areas: rule.areas,
        productPaths: rule.productPaths,
        reason: dedupeStrings(reasons).join(" ")
      });
    }
  }

  for (const rule of contract.bannedApis ?? []) {
    const reasons = matcherReasons(rule, likelyAreas, candidateFiles, candidateRoutes);
    addTextReason(reasons, tokens, rule.id, rule.name, rule.message, ...rule.apis);
    if (reasons.length > 0) {
      constraints.push({
        kind: "banned-api",
        id: rule.id,
        name: rule.name,
        severity: rule.severity,
        message: rule.message,
        files: rule.files,
        areas: rule.areas,
        productPaths: rule.productPaths,
        reason: dedupeStrings(reasons).join(" ")
      });
    }
  }

  for (const rule of contract.patternRules ?? []) {
    const reasons = matcherReasons(rule, likelyAreas, candidateFiles, candidateRoutes);
    addTextReason(reasons, tokens, rule.id, rule.name, rule.message, ...(rule.required ?? []), ...(rule.forbidden ?? []));
    if (reasons.length > 0) {
      constraints.push({
        kind: "pattern-rule",
        id: rule.id,
        name: rule.name,
        severity: rule.severity,
        message: rule.message,
        files: rule.files,
        areas: rule.areas,
        productPaths: rule.productPaths,
        reason: dedupeStrings(reasons).join(" ")
      });
    }
  }

  return constraints.slice(0, MAX_DESIGN_CONSTRAINTS);
}

function matcherReasons(
  matcher: DesignMatcher,
  likelyAreas: AgentPreflightArea[],
  candidateFiles: AgentPreflightCandidateFile[],
  candidateRoutes: AgentPreflightCandidateRoute[]
): string[] {
  const reasons: string[] = [];
  const likelyAreaKinds = new Set(likelyAreas.map((area) => area.kind));
  const matchingAreas = matcher.areas?.filter((area) => likelyAreaKinds.has(area)) ?? [];
  if (matchingAreas.length > 0) {
    reasons.push(`Matcher includes likely area(s): ${matchingAreas.join(", ")}.`);
  }

  const candidatePaths = candidateFiles.map((file) => file.path);
  const matchingFiles = candidatePaths.filter((path) => matcher.files?.some((pattern) => matchesPathPattern(path, pattern)));
  if (matchingFiles.length > 0) {
    reasons.push(`Matcher includes candidate file(s): ${matchingFiles.slice(0, 4).join(", ")}.`);
  }

  const matchingRoutes = candidateRoutes
    .map((route) => route.route)
    .filter((route) => matcher.productPaths?.some((pattern) => matchesPathPattern(route, pattern)));
  if (matchingRoutes.length > 0) {
    reasons.push(`Matcher includes candidate product path(s): ${matchingRoutes.slice(0, 4).join(", ")}.`);
  }

  return reasons;
}

function addTextReason(reasons: string[], tokens: string[], ...values: (string | undefined)[]): void {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  const hits = tokens.filter((token) => token.length >= 4 && text.includes(token));
  if (hits.length > 0) {
    reasons.push(`Rule text mentions task term(s): ${hits.slice(0, 5).join(", ")}.`);
  }
}

function createSuggestions(input: {
  task: string;
  likelyAreas: AgentPreflightArea[];
  candidateFiles: AgentPreflightCandidateFile[];
  candidateRoutes: AgentPreflightCandidateRoute[];
  memory: AgentPreflightMemoryEvidence;
  configuredChecks: AgentSuggestedCheck[];
}): AgentPreflightSuggestions {
  const areaKinds = new Set(input.likelyAreas.map((area) => area.kind));
  const implementationBrief = [
    `Start from the task intent: ${input.task}`,
    input.candidateFiles.length > 0
      ? `Inspect the highest-scoring candidate files first: ${input.candidateFiles.slice(0, 5).map((file) => `\`${file.path}\``).join(", ")}.`
      : "No repo file path strongly matched the task. Start by searching for the named product path, endpoint, component, or domain term before editing.",
    input.candidateRoutes.length > 0
      ? `Map the change to candidate route/API surfaces first: ${input.candidateRoutes.slice(0, 5).map(formatCandidateRoute).join(", ")}.`
      : "If this task reaches a user or API path, identify that path before changing internals.",
    input.memory.invariants.length > 0 || input.memory.regressions.length > 0
      ? "Review matched invariants and past regressions before implementation; they are likely constraints for this task."
      : "No matched invariant or regression memory was found; avoid inventing project rules without confirming them in code or docs."
  ];

  const proofPlan = proofPlanFor(areaKinds, input.configuredChecks, input.memory);

  return {
    implementationBrief,
    proofPlan,
    agentInstructions: [
      "Separate deterministic evidence from guesses in your implementation plan.",
      "Before editing, name the production path, API route, screen, background job, or config surface that the task can affect.",
      "Prefer adapters or existing project patterns over new custom engines.",
      "After editing, add proof that reaches the real changed path and then run the configured checks the user allows."
    ],
    nonGoals: [
      "Do not rewrite unrelated modules just because they appeared as low-confidence candidates.",
      "Do not treat this preflight as merge proof; it is a before-coding brief, not a post-change verification report.",
      "Do not add hidden model calls, telemetry, installs, deployments, or destructive commands."
    ],
    safetyConstraints: [
      "CodeDecay did not execute commands for this report.",
      "CodeDecay did not call an LLM or hosted CodeDecay service.",
      "Only repo-local files, config, and memory supplied to the report builder were used.",
      "Configured checks are listed as follow-up proof and have willRun=false."
    ]
  };
}

function proofPlanFor(
  areaKinds: Set<AgentPreflightAreaKind>,
  configuredChecks: AgentSuggestedCheck[],
  memory: AgentPreflightMemoryEvidence
): string[] {
  const plan: string[] = [];

  if (areaKinds.has("api")) {
    plan.push("Add or update an API-level regression test that calls the real route/handler and asserts status, response shape, and error behavior.");
  }

  if (areaKinds.has("ui")) {
    plan.push("Add or update a user-flow/browser check for the affected screen, including empty/error/loading states when relevant.");
  }

  if (areaKinds.has("database")) {
    plan.push("Verify persistence through the real query/migration path, including zero/null/duplicate data and rollback or retry behavior if relevant.");
  }

  if (areaKinds.has("auth")) {
    plan.push("Test authorized, unauthorized, expired-session, and wrong-role paths through the real auth boundary.");
  }

  if (areaKinds.has("config")) {
    plan.push("Validate the config/CI/env path with the project command that consumes it, not only schema or string-shape assertions.");
  }

  if (areaKinds.has("test")) {
    plan.push("Make the test prove real behavior: avoid snapshot-only checks, mocked changed modules, and copied implementation logic.");
  }

  for (const command of memory.commands.slice(0, 3)) {
    plan.push(`Memory suggests \`${command.command}\` (${command.title}). Review before running.`);
  }

  for (const check of configuredChecks.slice(0, 5)) {
    plan.push(`Run configured ${check.kind} check after edits if allowed: \`${check.command}\`.`);
  }

  return dedupeStrings(plan.length > 0 ? plan : ["Run the relevant project tests and add real-path proof for the changed behavior."]);
}

function formatCandidateRoute(route: AgentPreflightCandidateRoute): string {
  const methodPrefix = route.methods.length > 0 ? `${route.methods.join(", ")} ` : "";
  return `\`${methodPrefix}${route.route}\``;
}

function tokenize(value: string): string[] {
  return dedupeStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  ).slice(0, MAX_TASK_TOKENS);
}

function confidenceFor(
  areaCount: number,
  candidateFileCount: number,
  memoryMatches: number,
  requirementConfidence: AgentPreflightConfidence
): AgentPreflightConfidence {
  if (
    (requirementConfidence === "high" && candidateFileCount >= 1) ||
    (areaCount >= 2 && candidateFileCount >= 2)
  ) {
    return "high";
  }

  if (areaCount >= 1 && (candidateFileCount >= 1 || memoryMatches >= 1)) {
    return "medium";
  }

  return "low";
}

function requirementSearchText(requirements: RequirementContext): string {
  return [
    requirements.task.text,
    ...requirements.currentBehavior.map((entry) => entry.text),
    ...requirements.expectedBehavior.map((entry) => entry.text),
    ...requirements.acceptanceCriteria.flatMap((entry) => [entry.text, ...entry.requiredProof]),
    ...requirements.affectedFlows.flatMap((flow) => [flow.name, flow.description ?? ""]),
    ...requirements.invariants.map((entry) => entry.text),
    ...requirements.architectureConstraints.map((entry) => entry.text)
  ].join(" ");
}

function requirementScopeText(requirements: RequirementContext): string {
  return [
    requirements.task.text,
    ...requirements.affectedFlows.flatMap((flow) => [flow.name, flow.description ?? ""]),
    ...requirements.architectureConstraints.map((entry) => entry.text)
  ].join(" ");
}

function strongScopeTokens(tokens: string[]): string[] {
  return tokens.filter((token) => token.length >= 3 && !GENERIC_SCOPE_TOKENS.has(token));
}

function confidenceRank(confidence: AgentPreflightConfidence): number {
  if (confidence === "high") {
    return 3;
  }

  if (confidence === "medium") {
    return 2;
  }

  return 1;
}

function memoryCount(memory: AgentPreflightMemoryEvidence): number {
  return memory.flows.length + memory.commands.length + memory.invariants.length + memory.architecture.length + memory.regressions.length;
}

function isConfigPath(path: string): boolean {
  return (
    path.startsWith(".github/") ||
    path.startsWith(".codedecay/") ||
    path.includes("/config/") ||
    path.endsWith("config.yml") ||
    path.endsWith("config.yaml") ||
    path.endsWith("config.json") ||
    path === "package.json" ||
    path.startsWith("package.") ||
    path.startsWith("tsconfig") ||
    path.includes("vite.config") ||
    path.includes("webpack.config") ||
    path.includes("eslint.config") ||
    path.includes("dockerfile")
  );
}

function matchesPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const parts = pattern.split("*").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return true;
  }

  let searchFrom = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) {
      continue;
    }

    const foundAt = path.indexOf(part, searchFrom);
    if (foundAt === -1) {
      return false;
    }

    if (index === 0 && !pattern.startsWith("*") && foundAt !== 0) {
      return false;
    }

    searchFrom = foundAt + part.length;
  }

  const lastPart = parts[parts.length - 1];
  return pattern.endsWith("*") || (lastPart !== undefined && path.endsWith(lastPart));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
