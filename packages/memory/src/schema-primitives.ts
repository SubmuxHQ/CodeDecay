import type { ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";

export function normalizeArray(value: unknown, sourcePath: string, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be an array.`);
}

export function normalizeObject(value: unknown, sourcePath: string, field: string): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be an object.`);
}

export function requiredString(value: unknown, sourcePath: string, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} is required.`);
}

export function optionalString(value: unknown, sourcePath: string, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a string.`);
}

export function optionalStringArray(value: unknown, sourcePath: string, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a string array.`);
}

export function optionalRiskLevel(value: unknown, sourcePath: string, field: string): RiskLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be low, medium, or high.`);
}

export function optionalAreas(value: unknown, sourcePath: string, field: string): ImpactedArea["kind"][] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const validAreas = new Set(["api", "ui", "database", "auth", "config", "test", "source", "docs"]);
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && validAreas.has(item))) {
    return [...value] as ImpactedArea["kind"][];
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must contain valid impacted area names.`);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
