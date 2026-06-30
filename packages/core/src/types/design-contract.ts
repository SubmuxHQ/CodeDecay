import type { RiskLevel } from "../risk";
import type { ImpactedArea } from "./impact";

export interface DesignContract {
  version?: 1 | undefined;
  activeScopeFence?: string | undefined;
  scopeFences?: DesignScopeFence[] | undefined;
  boundaryRules?: DesignBoundaryRule[] | undefined;
  dependencyRules?: DesignDependencyRule[] | undefined;
  bannedApis?: DesignBannedApiRule[] | undefined;
  patternRules?: DesignPatternRule[] | undefined;
}

export interface DesignMatcher {
  files?: string[] | undefined;
  areas?: ImpactedArea["kind"][] | undefined;
  productPaths?: string[] | undefined;
}

export interface DesignScopeFence extends DesignMatcher {
  id: string;
  name?: string | undefined;
  allowedFiles?: string[] | undefined;
  allowedAreas?: ImpactedArea["kind"][] | undefined;
  severity?: RiskLevel | undefined;
  message?: string | undefined;
}

export interface DesignBoundaryRule {
  id: string;
  name?: string | undefined;
  from: DesignMatcher;
  disallow?: DesignMatcher | undefined;
  allow?: DesignMatcher | undefined;
  severity?: RiskLevel | undefined;
  message?: string | undefined;
}

export interface DesignDependencyRule extends DesignMatcher {
  id: string;
  name?: string | undefined;
  allowedImports?: string[] | undefined;
  bannedImports?: string[] | undefined;
  severity?: RiskLevel | undefined;
  message?: string | undefined;
}

export interface DesignBannedApiRule extends DesignMatcher {
  id: string;
  name?: string | undefined;
  apis: string[];
  severity?: RiskLevel | undefined;
  message?: string | undefined;
}

export interface DesignPatternRule extends DesignMatcher {
  id: string;
  name?: string | undefined;
  required?: string[] | undefined;
  forbidden?: string[] | undefined;
  severity?: RiskLevel | undefined;
  message?: string | undefined;
}
