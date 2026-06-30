import type {
  DesignBannedApiRule,
  DesignBoundaryRule,
  DesignContract,
  DesignDependencyRule,
  DesignMatcher,
  DesignPatternRule,
  DesignScopeFence,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";
import { isPlainObject, normalizeNonEmptyString, normalizeStringList } from "./primitives";

const AREA_KINDS = new Set<ImpactedArea["kind"]>(["api", "ui", "database", "auth", "config", "test", "source", "docs"]);
const RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);

export function normalizeDesignContract(value: unknown, sourcePath: string): DesignContract | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: designContract must be an object.`);
  }

  const version = value.version ?? 1;
  if (version !== 1) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: designContract.version must be 1.`);
  }

  const contract: DesignContract = {
    version: 1
  };

  if (value.activeScopeFence !== undefined) {
    contract.activeScopeFence = normalizeNonEmptyString(value.activeScopeFence, "designContract.activeScopeFence", sourcePath);
  }

  if (value.scopeFences !== undefined) {
    contract.scopeFences = normalizeArray(value.scopeFences, "designContract.scopeFences", sourcePath).map((item, index) =>
      normalizeScopeFence(item, `designContract.scopeFences[${index}]`, sourcePath)
    );
  }

  if (value.boundaryRules !== undefined) {
    contract.boundaryRules = normalizeArray(value.boundaryRules, "designContract.boundaryRules", sourcePath).map((item, index) =>
      normalizeBoundaryRule(item, `designContract.boundaryRules[${index}]`, sourcePath)
    );
  }

  if (value.dependencyRules !== undefined) {
    contract.dependencyRules = normalizeArray(value.dependencyRules, "designContract.dependencyRules", sourcePath).map((item, index) =>
      normalizeDependencyRule(item, `designContract.dependencyRules[${index}]`, sourcePath)
    );
  }

  if (value.bannedApis !== undefined) {
    contract.bannedApis = normalizeArray(value.bannedApis, "designContract.bannedApis", sourcePath).map((item, index) =>
      normalizeBannedApiRule(item, `designContract.bannedApis[${index}]`, sourcePath)
    );
  }

  if (value.patternRules !== undefined) {
    contract.patternRules = normalizeArray(value.patternRules, "designContract.patternRules", sourcePath).map((item, index) =>
      normalizePatternRule(item, `designContract.patternRules[${index}]`, sourcePath)
    );
  }

  return contract;
}

function normalizeScopeFence(value: unknown, field: string, sourcePath: string): DesignScopeFence {
  const object = normalizeObject(value, field, sourcePath);
  return {
    ...normalizeMatcher(object, field, sourcePath),
    id: normalizeNonEmptyString(object.id, `${field}.id`, sourcePath),
    name: optionalString(object.name, `${field}.name`, sourcePath),
    allowedFiles: optionalStringList(object.allowedFiles, `${field}.allowedFiles`, sourcePath),
    allowedAreas: optionalAreas(object.allowedAreas, `${field}.allowedAreas`, sourcePath),
    severity: optionalRisk(object.severity, `${field}.severity`, sourcePath),
    message: optionalString(object.message, `${field}.message`, sourcePath)
  };
}

function normalizeBoundaryRule(value: unknown, field: string, sourcePath: string): DesignBoundaryRule {
  const object = normalizeObject(value, field, sourcePath);
  const rule: DesignBoundaryRule = {
    id: normalizeNonEmptyString(object.id, `${field}.id`, sourcePath),
    from: normalizeMatcher(object.from, `${field}.from`, sourcePath),
    name: optionalString(object.name, `${field}.name`, sourcePath),
    severity: optionalRisk(object.severity, `${field}.severity`, sourcePath),
    message: optionalString(object.message, `${field}.message`, sourcePath)
  };

  if (object.disallow !== undefined) {
    rule.disallow = normalizeMatcher(object.disallow, `${field}.disallow`, sourcePath);
  }
  if (object.allow !== undefined) {
    rule.allow = normalizeMatcher(object.allow, `${field}.allow`, sourcePath);
  }

  return rule;
}

function normalizeDependencyRule(value: unknown, field: string, sourcePath: string): DesignDependencyRule {
  const object = normalizeObject(value, field, sourcePath);
  return {
    ...normalizeMatcher(object, field, sourcePath),
    id: normalizeNonEmptyString(object.id, `${field}.id`, sourcePath),
    name: optionalString(object.name, `${field}.name`, sourcePath),
    allowedImports: optionalStringList(object.allowedImports, `${field}.allowedImports`, sourcePath),
    bannedImports: optionalStringList(object.bannedImports, `${field}.bannedImports`, sourcePath),
    severity: optionalRisk(object.severity, `${field}.severity`, sourcePath),
    message: optionalString(object.message, `${field}.message`, sourcePath)
  };
}

function normalizeBannedApiRule(value: unknown, field: string, sourcePath: string): DesignBannedApiRule {
  const object = normalizeObject(value, field, sourcePath);
  return {
    ...normalizeMatcher(object, field, sourcePath),
    id: normalizeNonEmptyString(object.id, `${field}.id`, sourcePath),
    name: optionalString(object.name, `${field}.name`, sourcePath),
    apis: normalizeStringList(object.apis, `${field}.apis`, sourcePath),
    severity: optionalRisk(object.severity, `${field}.severity`, sourcePath),
    message: optionalString(object.message, `${field}.message`, sourcePath)
  };
}

function normalizePatternRule(value: unknown, field: string, sourcePath: string): DesignPatternRule {
  const object = normalizeObject(value, field, sourcePath);
  return {
    ...normalizeMatcher(object, field, sourcePath),
    id: normalizeNonEmptyString(object.id, `${field}.id`, sourcePath),
    name: optionalString(object.name, `${field}.name`, sourcePath),
    required: optionalStringList(object.required, `${field}.required`, sourcePath),
    forbidden: optionalStringList(object.forbidden, `${field}.forbidden`, sourcePath),
    severity: optionalRisk(object.severity, `${field}.severity`, sourcePath),
    message: optionalString(object.message, `${field}.message`, sourcePath)
  };
}

function normalizeMatcher(value: unknown, field: string, sourcePath: string): DesignMatcher {
  const object = normalizeObject(value, field, sourcePath);
  return {
    files: optionalStringList(object.files, `${field}.files`, sourcePath),
    areas: optionalAreas(object.areas, `${field}.areas`, sourcePath),
    productPaths: optionalStringList(object.productPaths, `${field}.productPaths`, sourcePath)
  };
}

function normalizeObject(value: unknown, field: string, sourcePath: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  return value;
}

function normalizeArray(value: unknown, field: string, sourcePath: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an array.`);
  }

  return value;
}

function optionalString(value: unknown, field: string, sourcePath: string): string | undefined {
  return value === undefined ? undefined : normalizeNonEmptyString(value, field, sourcePath);
}

function optionalStringList(value: unknown, field: string, sourcePath: string): string[] | undefined {
  return value === undefined ? undefined : normalizeStringList(value, field, sourcePath);
}

function optionalAreas(value: unknown, field: string, sourcePath: string): ImpactedArea["kind"][] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeStringList(value, field, sourcePath).map((area) => {
    if (AREA_KINDS.has(area as ImpactedArea["kind"])) {
      return area as ImpactedArea["kind"];
    }

    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must contain valid impacted area kinds.`);
  });
}

function optionalRisk(value: unknown, field: string, sourcePath: string): RiskLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  const risk = normalizeNonEmptyString(value, field, sourcePath);
  if (RISK_LEVELS.has(risk as RiskLevel)) {
    return risk as RiskLevel;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be low, medium, or high.`);
}
