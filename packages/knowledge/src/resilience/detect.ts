import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ResilienceCandidate, ResilienceFaultMode } from "./types";

const DETECTORS: Array<{ fault: ResilienceFaultMode; pattern: RegExp; note: string }> = [
  { fault: "timeout", pattern: /\b(timeout|AbortSignal|AbortController)\b/i, note: "Timeout configuration mentioned." },
  { fault: "http-5xx", pattern: /\b(retry|axios\.|fetch\(|circuitBreaker)\b/i, note: "HTTP client/retry surface mentioned." },
  {
    fault: "malformed-response",
    pattern: /\b(JSON\.parse|zod\.|schema\.parse)\b/i,
    note: "Response parsing mentioned; mixed-version risk."
  },
  {
    fault: "connection-refused",
    pattern: /\b(ECONNREFUSED|connect\(|createConnection)\b/i,
    note: "Connection path mentioned."
  }
];

export function detectResilienceCandidates(rootDir: string, files: string[]): ResilienceCandidate[] {
  const root = realpathSync(rootDir);
  const out: ResilienceCandidate[] = [];
  for (const file of files.slice(0, 50)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute) || !statSync(absolute).isFile() || statSync(absolute).size > 1024 * 1024) continue;
    const content = readFileSync(absolute, "utf8");
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    for (const detector of DETECTORS) {
      if (!detector.pattern.test(content)) continue;
      out.push({
        id: createHash("sha256").update(`${detector.fault}:${relativePath}`).digest("hex").slice(0, 12),
        surface: relativePath,
        sourceRef: relativePath,
        citedEvidence: [`keyword:${detector.fault}`],
        suggestedFault: detector.fault,
        note: `${detector.note} Keyword match is a candidate, not proof.`
      });
    }
  }
  return out;
}
