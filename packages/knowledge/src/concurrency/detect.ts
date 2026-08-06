import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ConcurrencyCandidate, ConcurrencyCandidateKind, ConcurrencyInvariant } from "./types";

const MAX_FILES = 50;
const MAX_FILE_BYTES = 1024 * 1024;

interface Detector {
  kind: ConcurrencyCandidateKind;
  pattern: RegExp;
  invariant: ConcurrencyInvariant;
  note: string;
}

const DETECTORS: Detector[] = [
  {
    kind: "idempotency-key",
    pattern: /\bidempotenc(y|yKey|y_key)\b/i,
    invariant: "exactly-once-effect",
    note: "Idempotency identity mentioned; keyword match is a candidate, not proof."
  },
  {
    kind: "retry",
    pattern: /\b(retry|maxAttempts|max_retries)\b/i,
    invariant: "bounded-retries",
    note: "Retry configuration mentioned; confirm bounded attempts and duplicate-safe handling."
  },
  {
    kind: "job",
    pattern: /\b(queue\.|BullMQ|SQS|consumeMessage|processJob)\b/i,
    invariant: "at-least-once-safe",
    note: "Queue/job surface mentioned; duplicate delivery must be oracle-tested."
  },
  {
    kind: "webhook",
    pattern: /\bwebhook\b/i,
    invariant: "exactly-once-effect",
    note: "Webhook handler mentioned; providers commonly redeliver."
  },
  {
    kind: "transaction",
    pattern: /\b(beginTransaction|withTransaction|START TRANSACTION)\b/i,
    invariant: "no-lost-update",
    note: "Transaction API mentioned; concurrent writers need an invariant."
  },
  {
    kind: "lock",
    pattern: /\b(SELECT\s+FOR\s+UPDATE|advisory_lock|distributedLock|mutex)\b/i,
    invariant: "no-lost-update",
    note: "Lock API mentioned; verify coverage under concurrent schedules."
  },
  {
    kind: "outbox",
    pattern: /\b(transactional\s+outbox|outbox_event|outbox)\b/i,
    invariant: "at-least-once-safe",
    note: "Outbox pattern mentioned; extension boundary for dual-write races."
  },
  {
    kind: "cron",
    pattern: /\b(cron|schedule\.|node-cron)\b/i,
    invariant: "exactly-once-effect",
    note: "Cron/scheduler mention; overlapping runs need an invariant."
  },
  {
    kind: "route",
    pattern: /\b(app\.(post|put|patch|delete)|router\.(post|put|patch|delete)|fastify\.(post|put|patch|delete))\b/i,
    invariant: "exactly-once-effect",
    note: "Mutating HTTP route mentioned; duplicate client retries are candidates."
  }
];

export function detectConcurrencyCandidates(rootDir: string, files: string[]): ConcurrencyCandidate[] {
  const root = realpathSync(rootDir);
  const candidates: ConcurrencyCandidate[] = [];
  for (const file of boundedFiles(root, files)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    if (statSync(absolute).size > MAX_FILE_BYTES) continue;
    const content = readFileSync(absolute, "utf8");
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    for (const detector of DETECTORS) {
      if (!detector.pattern.test(content)) continue;
      const id = hashId(`${detector.kind}:${relativePath}:${detector.invariant}`);
      candidates.push({
        id,
        kind: detector.kind,
        surface: relativePath,
        sourceRef: relativePath,
        citedEvidence: [`keyword:${detector.kind}`],
        suggestedInvariant: detector.invariant,
        note: detector.note
      });
    }
  }
  return dedupe(candidates);
}

function boundedFiles(root: string, files: string[]): string[] {
  return files.slice(0, MAX_FILES).map((file) => relative(root, resolve(root, file)).replaceAll("\\", "/"));
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function dedupe(candidates: ConcurrencyCandidate[]): ConcurrencyCandidate[] {
  const seen = new Set<string>();
  const out: ConcurrencyCandidate[] = [];
  for (const item of candidates) {
    const key = `${item.kind}:${item.surface}:${item.suggestedInvariant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
