export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePositiveInteger(value: unknown, field: string, sourcePath: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a positive integer.`);
}

export function normalizeBoolean(value: unknown, field: string, sourcePath: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a boolean.`);
}

export function normalizeStringList(value: unknown, field: string, sourcePath: string): string[] {
  if (typeof value === "string") {
    return [normalizeNonEmptyString(value, field, sourcePath)];
  }

  if (Array.isArray(value) && value.length > 0) {
    return value.map((item, index) => normalizeNonEmptyString(item, `${field}[${index}]`, sourcePath));
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a non-empty string or string array.`);
}

export function normalizeStringRecord(value: unknown, field: string, sourcePath: string): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field}.${key} must be a string.`);
    }

    record[key] = item;
  }

  return record;
}

export function normalizeNonEmptyString(value: unknown, field: string, sourcePath: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a non-empty string.`);
}

export function normalizeUrlString(value: unknown, field: string, sourcePath: string): string {
  const text = normalizeNonEmptyString(value, field, sourcePath);
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an http or https URL.`);
  }
}

export function normalizeRuntimeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function normalizeEnvironmentVariableName(value: unknown, field: string, sourcePath: string): string {
  const text = normalizeNonEmptyString(value, field, sourcePath);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    return text;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a valid environment variable name.`);
}
