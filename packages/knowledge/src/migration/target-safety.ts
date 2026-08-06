import type { MigrationConnectionTarget, MigrationTargetKind } from "./types";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);
const PROD_HINT =
  /\b(prod|production|live|aurora|rds\.amazonaws\.com|neon\.tech|supabase\.co|azure\.com|cloudsql|planetscale|cockroachlabs\.cloud|aiven\.io)\b/i;

/**
 * Classify a database connection target without persisting secrets.
 * Accepts a URL, host, or env-var *name*. Secret values are never returned.
 */
export function classifyMigrationConnectionTarget(input: {
  connectionUrl?: string | undefined;
  connectionHost?: string | undefined;
  databaseUrlEnv?: string | undefined;
  declaredTargetKind?: MigrationTargetKind | undefined;
}): MigrationConnectionTarget {
  const reasons: string[] = [];
  const envName = input.databaseUrlEnv?.trim();
  if (envName) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(envName)) {
      reasons.push("database URL environment variable names must match /^[A-Z][A-Z0-9_]*$/.");
    }
  }

  const raw = input.connectionUrl?.trim() || input.connectionHost?.trim() || "";
  const host =
    extractHost(raw) ??
    (looksLikeHost(raw) || LOCAL_HOSTS.has(raw.toLowerCase()) ? raw.toLowerCase() : undefined);
  const redacted = envName
    ? `env:${envName}`
    : host
      ? `host:${host}`
      : input.declaredTargetKind
        ? `kind:${input.declaredTargetKind}`
        : "unspecified";

  let kind: MigrationTargetKind = input.declaredTargetKind ?? "unspecified";
  if (host) {
    if (isLocalHost(host)) {
      kind = "disposable-local";
    } else if (PROD_HINT.test(host) || PROD_HINT.test(raw)) {
      kind = "production-like";
      reasons.push(`Connection target looks production-like (${host}).`);
    } else {
      kind = "remote-unapproved";
      reasons.push(`Remote host ${host} is not an approved disposable local target.`);
    }
  } else if (!input.declaredTargetKind) {
    kind = "unspecified";
    reasons.push("No connection host/URL or disposable-local target classification was supplied.");
  }

  if (kind === "production-like") {
    reasons.push("Production-like database targets are blocked.");
  }
  if (kind === "remote-unapproved") {
    reasons.push("Remote database target is not explicitly approved as disposable.");
  }

  const blocked = kind !== "disposable-local";
  return {
    kind,
    host,
    redacted,
    blocked,
    reasons: [...new Set(reasons)]
  };
}

function extractHost(value: string): string | undefined {
  if (!value) return undefined;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      const url = new URL(value);
      return url.hostname.toLowerCase() || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function looksLikeHost(value: string): boolean {
  return /^[a-z0-9.-]+$/i.test(value) && value.includes(".");
}

function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".localhost");
}
