export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
