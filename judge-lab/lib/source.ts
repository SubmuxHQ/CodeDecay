import { CODEDECAY_VERSION } from "../../packages/core/src/version";

const REPOSITORY_URL = "https://github.com/SubmuxHQ/CodeDecay";
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

export function sourceCommit(): string {
  const candidate = process.env.CODEDECAY_SOURCE_COMMIT?.trim();
  return candidate && COMMIT_PATTERN.test(candidate) ? candidate : "main";
}

export function siteOrigin(): string {
  const candidate = process.env.CODEDECAY_SITE_ORIGIN?.trim();
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost") {
        return parsed.origin;
      }
    } catch {
      // A deterministic local fallback keeps preview metadata valid.
    }
  }
  return "http://localhost:3000";
}

export function sourceLinks(commit = sourceCommit()) {
  const ref = COMMIT_PATTERN.test(commit) ? commit : "main";
  return {
    fixture: `${REPOSITORY_URL}/blob/${ref}/scripts/fixtures/end-user-demo/repo-fixtures.mjs`,
    engine: `${REPOSITORY_URL}/tree/${ref}/packages/matchers`,
    benchmark: `${REPOSITORY_URL}/blob/${ref}/docs/benchmark-corpus.md`,
    release: `${REPOSITORY_URL}/releases/tag/v${CODEDECAY_VERSION}`,
    sourceTree: `${REPOSITORY_URL}/tree/${ref}/judge-lab`,
  };
}
