import type { Finding, SecurityCandidate } from "@submuxhq/codedecay-core";
import { DEFAULT_SECURITY_MATCHERS } from "./defaults";
import { createSecurityMatcherRegistry } from "./registry";
import type { SecurityScanInput, SecurityScanResult } from "./types";

export function scanSecurityCandidates(input: SecurityScanInput): SecurityScanResult {
  const registry = input.registry ?? createDefaultSecurityMatcherRegistry();
  const candidates = dedupeCandidates(
    input.files.flatMap((file) =>
      registry
        .list()
        .flatMap((matcher) => matcher.match({ filePath: file.path, content: normalizeContent(file.content) }))
    )
  );

  return {
    candidates,
    findings: candidatesToFindings(candidates),
    scannedFiles: [...new Set(input.files.map((file) => file.path))].sort((left, right) => left.localeCompare(right)),
    skippedFiles: []
  };
}

export function createDefaultSecurityMatcherRegistry() {
  return createSecurityMatcherRegistry(DEFAULT_SECURITY_MATCHERS);
}

export function candidatesToFindings(candidates: SecurityCandidate[]): Finding[] {
  return candidates.map((candidate) => ({
    ruleId: candidate.ruleId,
    title: candidate.title,
    description: `${candidate.description} Evidence: ${candidate.evidence}`,
    severity: candidate.severity,
    category: "security",
    file: candidate.file,
    line: candidate.line
  }));
}

function dedupeCandidates(candidates: SecurityCandidate[]): SecurityCandidate[] {
  const byKey = new Map<string, SecurityCandidate>();

  for (const candidate of candidates) {
    const key = [candidate.ruleId, candidate.file, String(candidate.line ?? ""), candidate.evidence].join("\u001f");
    if (!byKey.has(key)) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const file = left.file.localeCompare(right.file);
    if (file !== 0) {
      return file;
    }

    const line = (left.line ?? 0) - (right.line ?? 0);
    if (line !== 0) {
      return line;
    }

    return left.ruleId.localeCompare(right.ruleId);
  });
}

function normalizeContent(content: string): string {
  return content.replaceAll("\r\n", "\n");
}
