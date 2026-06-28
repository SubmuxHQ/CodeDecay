import { normalizeWhitespace, slugifyLowerAscii } from "../exploration";

export function generatedTestId(...parts: string[]): string {
  return slugifyLowerAscii(parts.join("-"), "generated-test", 96);
}

export function regexLiteralForText(value: string): string {
  const escaped = escapeRegExp(normalizeWhitespace(value));
  return `/${escaped}/i`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
