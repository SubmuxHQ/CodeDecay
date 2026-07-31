export interface RedactionResult {
  text: string;
  count: number;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|session|cookie|authorization|bearer)\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s"',;]+)/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bghp_[A-Za-z0-9_]{8,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g
];

export function redactSessionSecrets(text: string): RedactionResult {
  let redacted = text;
  let count = 0;

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match: string, prefix?: string) => {
      count += 1;
      return prefix ? `${prefix}[REDACTED]` : "[REDACTED]";
    });
  }

  return { text: redacted, count };
}

export function redactSessionObject<T>(value: T): { value: T; count: number } {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return { value, count: 0 };
  }

  const redacted = redactSessionSecrets(serialized);
  return {
    value: JSON.parse(redacted.text) as T,
    count: redacted.count
  };
}
