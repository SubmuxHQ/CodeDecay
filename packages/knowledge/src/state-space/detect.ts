import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { StateSpaceCandidate, StateSpaceDimensionKind } from "./types";

const MAX_FILES = 50;
const MAX_FILE_BYTES = 1024 * 1024;

interface Detector {
  kind: StateSpaceDimensionKind;
  pattern: RegExp;
  note: string;
}

const DETECTORS: Detector[] = [
  {
    kind: "feature-flag",
    pattern: /\b(featureFlag|feature_flag|launchDarkly|unleash|flags?\.[a-zA-Z]|isEnabled\()\b/i,
    note: "Feature-flag API mentioned; keyword match is a candidate dimension, not proof."
  },
  {
    kind: "cache-state",
    pattern: /\b(redis|cache\.(get|set|del)|invalidate|memoize|lru)\b/i,
    note: "Cache API mentioned; model cold/warm/stale states explicitly."
  },
  {
    kind: "config-value",
    pattern: /\b(process\.env\.|config\.[a-zA-Z]|getConfig\()\b/i,
    note: "Config value mentioned; treat as a state dimension only with cited requirements."
  },
  {
    kind: "actor-tenant",
    pattern: /\b(tenantId|orgId|workspaceId|actorId)\b/i,
    note: "Tenant/actor identity mentioned; multi-tenant cache keys may diverge."
  },
  {
    kind: "rollout-cohort",
    pattern: /\b(rollout|cohort|canary|percentage)\b/i,
    note: "Rollout/cohort mention; pairwise with flags when requirements cite it."
  }
];

export function detectStateSpaceCandidates(rootDir: string, files: string[]): StateSpaceCandidate[] {
  const root = realpathSync(rootDir);
  const candidates: StateSpaceCandidate[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    if (statSync(absolute).size > MAX_FILE_BYTES) continue;
    const content = readFileSync(absolute, "utf8");
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    for (const detector of DETECTORS) {
      if (!detector.pattern.test(content)) continue;
      candidates.push({
        id: createHash("sha256").update(`${detector.kind}:${relativePath}`).digest("hex").slice(0, 12),
        kind: detector.kind,
        surface: relativePath,
        sourceRef: relativePath,
        citedEvidence: [`keyword:${detector.kind}`],
        note: detector.note
      });
    }
  }
  return candidates;
}
