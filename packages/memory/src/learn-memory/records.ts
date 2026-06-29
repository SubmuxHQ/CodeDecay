import { dedupeStrings } from "@submuxhq/codedecay-core";
import { isPlainObject } from "../schema";

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? dedupeStrings(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))
    : [];
}
