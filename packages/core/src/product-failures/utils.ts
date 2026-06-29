import type { ProductFailureClassification } from "../types";

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function isFailureStatus(status: string | undefined): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out" || status === "error";
}

export function productFailureClassificationValue(value: unknown): ProductFailureClassification | undefined {
  return [
    "confirmed-regression",
    "likely-flaky",
    "environment-failure",
    "auth-or-test-data-failure",
    "generated-test-weakness",
    "unknown"
  ].includes(String(value))
    ? (value as ProductFailureClassification)
    : undefined;
}

export function slugId(value: string): string {
  let slug = "";
  let pendingSeparator = false;

  for (const char of value.toLowerCase()) {
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) {
      if (pendingSeparator && slug.length > 0 && slug.length < 96) {
        slug += "-";
      }
      pendingSeparator = false;
      if (slug.length < 96) {
        slug += char;
      }
      continue;
    }

    pendingSeparator = slug.length > 0;
  }

  while (slug.endsWith("-")) {
    slug = slug.slice(0, -1);
  }

  return slug || "product-failure";
}
