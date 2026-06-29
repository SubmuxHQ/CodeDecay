import type { ProductBlockedAction } from "../../../types";
import { normalizeWhitespace } from "../html";

export type ResolveProductUrl = (value: string, baseUrl: string) => string | undefined;

export interface ProductInteractionState {
  recordedActions: number;
  skippedActions: number;
  blockedActions: ProductBlockedAction[];
}

export function selectorFromAttrs(tag: string, attrs: Record<string, string>, index: number): string {
  if (attrs.id) {
    return `${tag}#${escapeSelectorValue(attrs.id)}`;
  }

  if (attrs.name) {
    return `${tag}[name="${escapeSelectorValue(attrs.name)}"]`;
  }

  if (attrs["aria-label"]) {
    return `${tag}[aria-label="${escapeSelectorValue(attrs["aria-label"])}"]`;
  }

  if (attrs.type) {
    return `${tag}[type="${escapeSelectorValue(attrs.type)}"]:nth-of-type(${index})`;
  }

  return `${tag}:nth-of-type(${index})`;
}

export function accessibleName(attrs: Record<string, string>, text: string, fallback: string): string {
  const candidate = attrs["aria-label"] ?? attrs.title ?? attrs.name ?? attrs.value ?? attrs.placeholder ?? text;
  const cleaned = normalizeWhitespace(candidate);
  return cleaned || fallback;
}

export function isDestructiveText(value: string): boolean {
  return /\b(delete|remove|destroy|drop|reset|purchase|payment|checkout|confirm|submit|disable|revoke|archive)\b/i.test(value);
}

export function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
