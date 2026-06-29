export const DEFAULT_OUTPUT_LIMIT = 64 * 1024;

export function appendOutput(existing: string, next: string, outputLimit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= outputLimit) {
    return combined;
  }

  return combined.slice(combined.length - outputLimit);
}

export function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
