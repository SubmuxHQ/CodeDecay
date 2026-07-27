import type { CodeDecayReport, ImpactedArea } from "@submuxhq/codedecay-core";
import type {
  RedteamEdgeCaseProof,
  RedteamEdgeCaseScope
} from "../types";

export interface EdgeCaseTemplate {
  id: string;
  area: ImpactedArea["kind"];
  applies?(report: CodeDecayReport, scope: RedteamEdgeCaseScope): boolean;
  title(scope: RedteamEdgeCaseScope): string;
  trigger: string;
  expectedBehavior: string;
  userVisibleFailure: string;
  proof(scope: RedteamEdgeCaseScope): RedteamEdgeCaseProof;
}

export const EDGE_CASE_TEMPLATES: EdgeCaseTemplate[] = [
  {
    id: "auth-fail-closed",
    area: "auth",
    title: (scope) => `Keep ${primarySurface(scope)} closed to unauthorized credentials`,
    trigger:
      "A request reaches the changed surface with missing, expired, malformed, replayed, or lower-privilege credentials.",
    expectedBehavior:
      "The real authorization path rejects the request with 401 or 403, exposes no privileged data, and performs no protected side effect.",
    userVisibleFailure:
      "An unauthorized user receives privileged data or completes an action that should have been denied.",
    proof: (scope) => ({
      kind: "api-integration",
      recommendation: authProof(scope)
    })
  },
  {
    id: "api-invalid-input",
    area: "api",
    title: (scope) => `Reject invalid and boundary input on ${primaryApiInputSurface(scope)}`,
    trigger:
      "A real request sends a missing required field, malformed body, invalid enum, empty value, or numeric boundary such as zero.",
    expectedBehavior:
      "The route returns its documented client error without partial writes, internal details, or an unexpected success response.",
    userVisibleFailure:
      "The caller sees a 500 or false success, while downstream state may be partially written or inconsistent.",
    proof: (scope) => ({
      kind: "api-integration",
      recommendation: apiInputProof(scope)
    })
  },
  {
    id: "api-retry-idempotency",
    area: "api",
    applies: (_report, scope) => scope.routes.some(hasMutatingMethod),
    title: (scope) => `Keep retried mutations idempotent on ${primaryMutatingSurface(scope)}`,
    trigger:
      "A client retries the same mutating request after a timeout, disconnect, or concurrent duplicate delivery.",
    expectedBehavior:
      "The operation produces one durable side effect and returns the existing result or a documented conflict for duplicate delivery.",
    userVisibleFailure:
      "The user receives duplicate records, charges, jobs, notifications, or another repeated side effect after a normal retry.",
    proof: (scope) => ({
      kind: "api-integration",
      recommendation: `Send the same real request twice to ${primaryMutatingSurface(scope)} with the same idempotency identity, simulate an uncertain first response, and assert one durable side effect.`
    })
  },
  {
    id: "database-legacy-data",
    area: "database",
    title: (scope) => `Preserve legacy data behavior through ${primarySurface(scope)}`,
    trigger:
      "An existing record contains null, missing, duplicate, or legacy values while the changed read or write path uses the new schema behavior.",
    expectedBehavior:
      "Existing records remain readable and writable, defaults preserve least privilege, and constraints do not corrupt or silently discard data.",
    userVisibleFailure:
      "An API, background job, or data view crashes, returns the wrong record state, or persists corrupted data for existing users.",
    proof: (scope) => ({
      kind: "database-integration",
      recommendation: `Run a real database integration test for ${fileOrSurface(scope)} using pre-change null and legacy records, then exercise both read and write paths.`
    })
  },
  {
    id: "ui-empty-error-permission",
    area: "ui",
    title: (scope) => `Render empty, error, and denied states on ${primarySurface(scope)}`,
    trigger:
      "The changed screen receives an empty result, delayed response, API error, stale data, or permission-denied response.",
    expectedBehavior:
      "The screen renders the correct loading, empty, error, and denied state without exposing stale privileged content or enabling invalid actions.",
    userVisibleFailure:
      "The user sees a blank or crashed screen, stale privileged data, or an action that appears available but cannot complete.",
    proof: (scope) => ({
      kind: "browser",
      recommendation: `Run a real browser flow through ${routeOrSurface(scope)} with empty, error, stale, and permission-denied responses and assert visible behavior.`
    })
  },
  {
    id: "config-missing-environment",
    area: "config",
    title: (scope) => `Fail safely when production configuration is missing for ${primarySurface(scope)}`,
    trigger:
      "A clean production-like process starts with a required environment variable missing, malformed, or set only to a development fallback.",
    expectedBehavior:
      "Startup fails with a clear error or uses an explicitly safe production value; it never silently enables insecure defaults.",
    userVisibleFailure:
      "The service starts with a development secret, insecure transport, or wrong dependency endpoint and fails only after users send traffic.",
    proof: (scope) => ({
      kind: "integration",
      recommendation: `Start the built service in a clean environment around ${fileOrSurface(scope)} with required values missing and malformed, then assert bounded failure behavior.`
    })
  }
];

function primarySurface(scope: RedteamEdgeCaseScope): string {
  return scope.routes[0] ?? scope.symbols[0] ?? scope.files[0] ?? "the changed surface";
}

function routeOrSurface(scope: RedteamEdgeCaseScope): string {
  return scope.routes[0] ?? scope.symbols[0] ?? scope.files[0] ?? "the changed public boundary";
}

function fileOrSurface(scope: RedteamEdgeCaseScope): string {
  return scope.symbols[0] ?? scope.files[0] ?? scope.routes[0] ?? "the changed data boundary";
}

function authProof(scope: RedteamEdgeCaseScope): string {
  const cases = "missing, expired, malformed, and lower-privilege credentials";
  return scope.routes[0]
    ? `Call ${scope.routes[0]} with ${cases} and assert the response plus side effects.`
    : `Exercise ${primarySurface(scope)} through its real authorization integration boundary with ${cases}, then assert rejection and side effects.`;
}

function apiInputProof(scope: RedteamEdgeCaseScope): string {
  const cases = "missing, malformed, empty, and zero-value inputs";
  return scope.routes[0]
    ? `Send real HTTP requests to ${primaryApiInputSurface(scope)} for ${cases} and assert status, body, and side effects.`
    : `Exercise ${primarySurface(scope)} through its real router or API integration boundary with ${cases}, then assert status, result, and side effects.`;
}

function primaryApiInputSurface(scope: RedteamEdgeCaseScope): string {
  const mutatingRoute = scope.routes.find(hasMutatingMethod);
  return mutatingRoute ? mutatingOnlySurface(mutatingRoute) : primarySurface(scope);
}

function primaryMutatingSurface(scope: RedteamEdgeCaseScope): string {
  const route = scope.routes.find(hasMutatingMethod);
  return route ? mutatingOnlySurface(route) : primarySurface(scope);
}

function hasMutatingMethod(route: string): boolean {
  return mutatingMethods(route).length > 0;
}

function mutatingOnlySurface(route: string): string {
  const separator = route.indexOf(" ");
  if (separator === -1) {
    return route;
  }
  return `${mutatingMethods(route).join("|")} ${route.slice(separator + 1)}`;
}

function mutatingMethods(route: string): string[] {
  const separator = route.indexOf(" ");
  if (separator === -1) {
    return [];
  }
  const methods = route.slice(0, separator).split("|");
  return methods.filter((method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method));
}
