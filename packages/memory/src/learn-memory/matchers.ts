import type { ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { normalizeProductPath, optionalStringArray } from "../schema";
import type { MemoryMatcher } from "../types";
import { normalizeReportArray } from "./reports";
import { stringArray, stringValue } from "./records";

export function inferMemoryMatcher(object: Record<string, unknown>, text: string): MemoryMatcher {
  const files = collectMatcherFiles(object);
  const areas = dedupeAreas([
    ...collectMatcherAreas(object),
    ...files.map(inferAreaFromFile).filter((area): area is ImpactedArea["kind"] => Boolean(area)),
    ...inferAreasFromText(text)
  ]);
  const matcher: MemoryMatcher = {};

  if (files.length > 0) {
    matcher.files = files;
  }

  if (areas.length > 0) {
    matcher.areas = areas;
  }

  const productPaths = optionalStringArray(object.productPaths, "learned memory", "productPaths");
  if (productPaths && productPaths.length > 0) {
    matcher.productPaths = productPaths.map(normalizeProductPath);
  }

  return matcher;
}

export function normalizeAreaKind(value: string): ImpactedArea["kind"] | undefined {
  const normalized = value.toLowerCase();
  return ["api", "ui", "database", "auth", "config", "test", "source", "docs"].includes(normalized)
    ? (normalized as ImpactedArea["kind"])
    : undefined;
}

export function normalizeRiskValue(value: unknown): RiskLevel {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

export function looksLikeRegressionLearning(text: string): boolean {
  return /\b(fix|fixed|bug|regression|incident|failure|failed|broken|prevent|restore|wrong|missing|not refreshing|unauthorized|forbidden)\b/i.test(
    text
  );
}

export function inferCheckFromText(title: string, text: string): string {
  const trimmedTitle = title.trim();
  if (/\b(auth|session|token|unauthorized|forbidden)\b/i.test(text)) {
    return `Verify auth/session regression path for ${trimmedTitle}`;
  }

  if (/\b(api|route|endpoint|request|response)\b/i.test(text)) {
    return `Verify API regression path for ${trimmedTitle}`;
  }

  if (/\b(db|database|schema|migration)\b/i.test(text)) {
    return `Verify database regression path for ${trimmedTitle}`;
  }

  return `Verify regression path for ${trimmedTitle}`;
}

function collectMatcherFiles(object: Record<string, unknown>): string[] {
  const direct = [
    ...stringArray(object.files),
    ...stringArray(object.paths),
    ...stringArray(object.changedFiles),
    ...stringArray(object.impactedFiles)
  ];
  const nested = [
    ...normalizeReportArray(object.findings).flatMap((finding) => stringValue(finding.file) ?? []),
    ...normalizeReportArray(object.impactedAreas).flatMap((area) => stringArray(area.files))
  ];

  return dedupeStrings([...direct, ...nested].filter((file) => file.length > 0));
}

function collectMatcherAreas(object: Record<string, unknown>): ImpactedArea["kind"][] {
  return dedupeAreas(
    [
      ...stringArray(object.areas),
      ...stringArray(object.impactedAreas),
      ...stringArray(object.tags)
    ].flatMap((area) => normalizeAreaKind(area) ?? [])
  );
}

function inferAreaFromFile(path: string): ImpactedArea["kind"] | undefined {
  const normalized = path.toLowerCase();

  if (/(^|\/)(app\/api|pages\/api|api|routes|controllers)\//.test(normalized)) {
    return "api";
  }

  if (/(^|\/)(app|pages|components|views|screens)\//.test(normalized)) {
    return "ui";
  }

  if (/(^|\/)(prisma|migrations|schema|models|db|database)\//.test(normalized) || normalized.endsWith("schema.prisma")) {
    return "database";
  }

  if (/(auth|session|permission|rbac|jwt|oauth)/.test(normalized)) {
    return "auth";
  }

  if (/(config|env|docker|deploy|workflow|ci|package\.json|tsconfig|vite|webpack)/.test(normalized)) {
    return "config";
  }

  if (/(test|spec|__tests__|fixture)/.test(normalized)) {
    return "test";
  }

  if (/(readme|docs|\\.md$)/.test(normalized)) {
    return "docs";
  }

  return "source";
}

function inferAreasFromText(text: string): ImpactedArea["kind"][] {
  const normalized = text.toLowerCase();
  const areas: ImpactedArea["kind"][] = [];

  if (/\b(api|endpoint|route|request|response|controller)\b/.test(normalized)) {
    areas.push("api");
  }

  if (/\b(ui|screen|page|component|browser|playwright|user flow)\b/.test(normalized)) {
    areas.push("ui");
  }

  if (/\b(db|database|schema|migration|prisma|sql)\b/.test(normalized)) {
    areas.push("database");
  }

  if (/\b(auth|session|token|permission|rbac|oauth|jwt)\b/.test(normalized)) {
    areas.push("auth");
  }

  if (/\b(config|deploy|ci|workflow|env|docker)\b/.test(normalized)) {
    areas.push("config");
  }

  if (/\b(test|spec|coverage|fixture)\b/.test(normalized)) {
    areas.push("test");
  }

  return dedupeAreas(areas);
}

function dedupeAreas(values: ImpactedArea["kind"][]): ImpactedArea["kind"][] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
