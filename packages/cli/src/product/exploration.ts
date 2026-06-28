import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type {
  ProductBlockedAction,
  ProductExplorerOptions,
  ProductFlowLink,
  ProductFlowPage,
  ProductHealthResult,
  ProductInteractiveElement
} from "../types";

export interface ProductPlaywrightPage {
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  title?: () => Promise<string>;
  url?: () => string;
  screenshot?: (options: { path: string; fullPage: boolean }) => Promise<unknown>;
  close?: () => Promise<void>;
}

export function resolveProductExploreBaseUrl(target: CodeDecayProductTarget, health: ProductHealthResult): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  const healthOrigin = resolveMaybeUrl(health.url, health.url);
  return healthOrigin ? new URL(healthOrigin).origin : undefined;
}

export function normalizeExploreUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "") || url.origin;
}

export function resolveMaybeUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return undefined;
  }
}

export async function captureProductScreenshot(input: {
  page: ProductPlaywrightPage;
  rootDir: string;
  artifactRoot: string;
  url: string;
}): Promise<string | undefined> {
  if (!input.page.screenshot) {
    return undefined;
  }

  const screenshotPath = join(input.artifactRoot, "screenshots", `${sanitizeArtifactSegment(new URL(input.url).pathname || "root")}.png`);
  try {
    mkdirSync(dirname(join(input.rootDir, screenshotPath)), { recursive: true });
    await input.page.screenshot({
      path: join(input.rootDir, screenshotPath),
      fullPage: true
    });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

export function extractProductFlowPage(input: {
  url: string;
  html: string;
  origin: string;
  depth: number;
  options: ProductExplorerOptions;
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  };
}): ProductFlowPage {
  const links = extractProductLinks(input.html, input.url, input.origin);
  const interactiveElements: ProductInteractiveElement[] = [];

  for (const link of links) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, {
      kind: "link",
      selector: link.selector,
      name: link.text,
      action: link.href,
      destructive: false,
      blocked: false
    });
  }

  for (const form of extractProductForms(input.html, input.url)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, form);
  }

  for (const button of extractProductButtons(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, button);
  }

  for (const inputElement of extractProductInputs(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, inputElement);
  }

  return {
    url: input.url,
    title: extractHtmlTitle(input.html),
    path: new URL(input.url).pathname || "/",
    depth: input.depth,
    links,
    interactiveElements
  };
}

export function extractHtmlTitle(html: string): string {
  const title = extractHtmlElements(html, "title")[0];
  return title ? normalizeWhitespace(stripHtml(title.innerHtml)) : "";
}

export function sanitizeArtifactSegment(value: string): string {
  return slugifyAllowedAscii(value, "root", 160, isArtifactSegmentChar);
}

export function slugifyLowerAscii(value: string, fallback: string, maxLength: number): string {
  return slugifyAllowedAscii(value.toLowerCase(), fallback, maxLength, isLowerAsciiAlphaNumeric);
}

function appendInteractiveElement(
  elements: ProductInteractiveElement[],
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  },
  options: ProductExplorerOptions,
  pageUrl: string,
  element: ProductInteractiveElement
): void {
  if (state.recordedActions >= options.maxActions) {
    state.skippedActions += 1;
    return;
  }

  const blockedElement =
    element.destructive && !options.allowDestructiveActions
      ? {
          ...element,
          blocked: true,
          blockReason: element.blockReason ?? "Potentially destructive product action."
        }
      : {
          ...element,
          blocked: false,
          blockReason: undefined
        };

  elements.push(blockedElement);
  state.recordedActions += 1;

  if (blockedElement.blocked) {
    state.blockedActions.push({
      pageUrl,
      selector: blockedElement.selector,
      name: blockedElement.name,
      reason: blockedElement.blockReason ?? "Potentially destructive product action."
    });
  }
}

function extractProductLinks(html: string, baseUrl: string, origin: string): ProductFlowLink[] {
  const links: ProductFlowLink[] = [];
  const seen = new Set<string>();

  for (const element of extractHtmlElements(html, "a")) {
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const rawHref = attrs.href;
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) {
      continue;
    }

    const href = resolveMaybeUrl(rawHref, baseUrl);
    if (!href || seen.has(href)) {
      continue;
    }

    seen.add(href);
    const sameOrigin = new URL(href).origin === origin;
    links.push({
      href,
      text: accessibleName(attrs, stripHtml(element.innerHtml), rawHref),
      selector: `a[href="${escapeSelectorValue(rawHref)}"]`,
      sameOrigin,
      discovered: sameOrigin
    });
  }

  return links.sort((left, right) => left.href.localeCompare(right.href));
}

function extractProductForms(html: string, baseUrl: string): ProductInteractiveElement[] {
  const forms: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlElements(html, "form")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const method = (attrs.method ?? "get").toLowerCase();
    const rawAction = attrs.action ?? baseUrl;
    const action = resolveMaybeUrl(rawAction, baseUrl) ?? rawAction;
    const text = stripHtml(element.innerHtml);
    const name = accessibleName(attrs, text, `form ${index}`);
    const destructive = method !== "get" || isDestructiveText(`${name} ${method} ${rawAction}`);

    forms.push({
      kind: "form",
      selector: selectorFromAttrs("form", attrs, index),
      name,
      action,
      method,
      destructive,
      blocked: destructive,
      blockReason: destructive ? `Form method ${method.toUpperCase()} may mutate product state.` : undefined
    });
  }

  return forms;
}

function extractProductButtons(html: string): ProductInteractiveElement[] {
  const buttons: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlElements(html, "button")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const name = accessibleName(attrs, stripHtml(element.innerHtml), `button ${index}`);
    const type = (attrs.type ?? "submit").toLowerCase();
    const destructive = isDestructiveText(`${name} ${type}`);

    buttons.push({
      kind: "button",
      selector: selectorFromAttrs("button", attrs, index),
      name,
      inputType: type,
      destructive,
      blocked: destructive,
      blockReason: destructive ? "Button name or type matches a destructive action pattern." : undefined
    });
  }

  return buttons;
}

function extractProductInputs(html: string): ProductInteractiveElement[] {
  const inputs: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlStartTags(html, "input")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const type = (attrs.type ?? "text").toLowerCase();
    const name = accessibleName(attrs, attrs.value ?? attrs.placeholder ?? "", `input ${index}`);
    const destructive = ["submit", "button", "reset"].includes(type) && isDestructiveText(`${name} ${type}`);

    inputs.push({
      kind: "input",
      selector: selectorFromAttrs("input", attrs, index),
      name,
      inputType: type,
      destructive,
      blocked: destructive,
      blockReason: destructive ? "Input action matches a destructive action pattern." : undefined
    });
  }

  return inputs;
}

function parseHtmlAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  let index = 0;
  while (index < raw.length) {
    while (index < raw.length && (isHtmlWhitespace(raw[index] ?? "") || raw[index] === "/")) {
      index += 1;
    }

    const nameStart = index;
    while (index < raw.length && isHtmlAttributeNameChar(raw[index] ?? "")) {
      index += 1;
    }

    if (index === nameStart) {
      index += 1;
      continue;
    }

    const key = raw.slice(nameStart, index).toLowerCase();
    while (index < raw.length && isHtmlWhitespace(raw[index] ?? "")) {
      index += 1;
    }

    let value = "";
    if (raw[index] === "=") {
      index += 1;
      while (index < raw.length && isHtmlWhitespace(raw[index] ?? "")) {
        index += 1;
      }

      const quote = raw[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < raw.length && raw[index] !== quote) {
          index += 1;
        }
        value = raw.slice(valueStart, index);
        if (raw[index] === quote) {
          index += 1;
        }
      } else {
        const valueStart = index;
        while (index < raw.length && !isHtmlWhitespace(raw[index] ?? "") && !['"', "'", ">", "/", "=", "`"].includes(raw[index] ?? "")) {
          index += 1;
        }
        value = raw.slice(valueStart, index);
      }
    }

    attrs[key] = decodeHtmlEntities(value);
  }

  return attrs;
}

function selectorFromAttrs(tag: string, attrs: Record<string, string>, index: number): string {
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

function accessibleName(attrs: Record<string, string>, text: string, fallback: string): string {
  const candidate = attrs["aria-label"] ?? attrs.title ?? attrs.name ?? attrs.value ?? attrs.placeholder ?? text;
  const cleaned = normalizeWhitespace(candidate);
  return cleaned || fallback;
}

function stripHtml(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(extractHtmlText(value)));
}

export function normalizeWhitespace(value: string): string {
  let normalized = "";
  let pendingSpace = false;

  for (const char of value) {
    if (isHtmlWhitespace(char)) {
      pendingSpace = normalized.length > 0;
      continue;
    }

    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += char;
  }

  return normalized;
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
  };
  let decoded = "";
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "&") {
      decoded += value[index] ?? "";
      index += 1;
      continue;
    }

    const semicolon = findEntitySemicolon(value, index + 1);
    if (semicolon === -1) {
      decoded += "&";
      index += 1;
      continue;
    }

    const entity = value.slice(index + 1, semicolon);
    const replacement = decodeHtmlEntity(entity, namedEntities);
    if (replacement === undefined) {
      decoded += value.slice(index, semicolon + 1);
    } else {
      decoded += replacement;
    }
    index = semicolon + 1;
  }

  return decoded;
}

interface ParsedHtmlElement {
  rawAttributes: string;
  innerHtml: string;
}

interface ParsedHtmlStartTag {
  tagName: string;
  rawAttributes: string;
  tagEnd: number;
  closing: boolean;
  selfClosing: boolean;
}

function extractHtmlElements(html: string, tagName: string): ParsedHtmlElement[] {
  const target = tagName.toLowerCase();
  const elements: ParsedHtmlElement[] = [];
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      break;
    }

    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    if (!tag.closing && tag.tagName === target) {
      const closingStart = findClosingTagStart(html, target, tag.tagEnd + 1);
      if (closingStart === -1) {
        index = tag.tagEnd + 1;
        continue;
      }

      const closingTag = parseHtmlStartTagAt(html, closingStart);
      elements.push({
        rawAttributes: tag.rawAttributes,
        innerHtml: html.slice(tag.tagEnd + 1, closingStart)
      });
      index = closingTag ? closingTag.tagEnd + 1 : closingStart + 1;
      continue;
    }

    index = tag.tagEnd + 1;
  }

  return elements;
}

function extractHtmlStartTags(html: string, tagName: string): Array<Omit<ParsedHtmlElement, "innerHtml">> {
  const target = tagName.toLowerCase();
  const elements: Array<Omit<ParsedHtmlElement, "innerHtml">> = [];
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      break;
    }

    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    if (!tag.closing && tag.tagName === target) {
      elements.push({ rawAttributes: tag.rawAttributes });
    }
    index = tag.tagEnd + 1;
  }

  return elements;
}

function extractHtmlText(html: string): string {
  let text = "";
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      text += html.slice(index);
      break;
    }

    text += html.slice(index, tagStart);
    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      text += "<";
      index = tagStart + 1;
      continue;
    }

    if (!tag.closing && (tag.tagName === "script" || tag.tagName === "style")) {
      const closingStart = findClosingTagStart(html, tag.tagName, tag.tagEnd + 1);
      if (closingStart === -1) {
        break;
      }
      const closingTag = parseHtmlStartTagAt(html, closingStart);
      index = closingTag ? closingTag.tagEnd + 1 : closingStart + 1;
      continue;
    }

    text += " ";
    index = tag.tagEnd + 1;
  }

  return text;
}

function parseHtmlStartTagAt(html: string, tagStart: number): ParsedHtmlStartTag | undefined {
  if (html[tagStart] !== "<") {
    return undefined;
  }

  const tagEnd = findHtmlTagEnd(html, tagStart + 1);
  if (tagEnd === -1) {
    return undefined;
  }

  let index = tagStart + 1;
  while (index < tagEnd && isHtmlWhitespace(html[index] ?? "")) {
    index += 1;
  }

  const closing = html[index] === "/";
  if (closing) {
    index += 1;
    while (index < tagEnd && isHtmlWhitespace(html[index] ?? "")) {
      index += 1;
    }
  }

  const nameStart = index;
  while (index < tagEnd && isHtmlTagNameChar(html[index] ?? "")) {
    index += 1;
  }

  const tagName = html.slice(nameStart, index).toLowerCase();
  const rawAttributes = closing || !tagName ? "" : html.slice(index, tagEnd);
  let selfClosing = false;
  let cursor = tagEnd - 1;
  while (cursor > index && isHtmlWhitespace(html[cursor] ?? "")) {
    cursor -= 1;
  }
  if (html[cursor] === "/") {
    selfClosing = true;
  }

  return {
    tagName,
    rawAttributes,
    tagEnd,
    closing,
    selfClosing
  };
}

function findHtmlTagEnd(html: string, start: number): number {
  let quote: string | undefined;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index] ?? "";
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function findClosingTagStart(html: string, tagName: string, start: number): number {
  let index = start;
  let depth = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      return -1;
    }

    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    if (tag.tagName === tagName) {
      if (tag.closing) {
        if (depth === 0) {
          return tagStart;
        }
        depth -= 1;
      } else if (!tag.selfClosing) {
        depth += 1;
      }
    }

    index = tag.tagEnd + 1;
  }

  return -1;
}

function findEntitySemicolon(value: string, start: number): number {
  const maxEntityLength = 32;
  const limit = Math.min(value.length, start + maxEntityLength);
  for (let index = start; index < limit; index += 1) {
    const char = value[index] ?? "";
    if (char === ";") {
      return index;
    }
    if (isHtmlWhitespace(char) || char === "&") {
      return -1;
    }
  }
  return -1;
}

function decodeHtmlEntity(entity: string, namedEntities: Record<string, string>): string | undefined {
  const normalized = entity.toLowerCase();
  if (normalized.startsWith("#x")) {
    return decodeNumericHtmlEntity(normalized.slice(2), 16);
  }
  if (normalized.startsWith("#")) {
    return decodeNumericHtmlEntity(normalized.slice(1), 10);
  }
  if (normalized === "#39") {
    return "'";
  }
  return namedEntities[normalized];
}

function decodeNumericHtmlEntity(value: string, radix: 10 | 16): string | undefined {
  if (!value || !isValidNumericEntity(value, radix)) {
    return undefined;
  }

  const codePoint = Number.parseInt(value, radix);
  if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return undefined;
  }

  return String.fromCodePoint(codePoint);
}

function isValidNumericEntity(value: string, radix: 10 | 16): boolean {
  for (const char of value) {
    if (radix === 10) {
      if (char < "0" || char > "9") {
        return false;
      }
    } else if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f"))) {
      return false;
    }
  }
  return true;
}

function isHtmlWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f" || char === "\v" || char === "\u00a0";
}

function isHtmlTagNameChar(char: string): boolean {
  return (
    (char >= "a" && char <= "z") ||
    (char >= "A" && char <= "Z") ||
    (char >= "0" && char <= "9") ||
    char === "-" ||
    char === ":"
  );
}

function isHtmlAttributeNameChar(char: string): boolean {
  return isHtmlTagNameChar(char) || char === "_" || char === ".";
}

function isDestructiveText(value: string): boolean {
  return /\b(delete|remove|destroy|drop|reset|purchase|payment|checkout|confirm|submit|disable|revoke|archive)\b/i.test(value);
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slugifyAllowedAscii(
  value: string,
  fallback: string,
  maxLength: number,
  allowed: (char: string) => boolean
): string {
  let slug = "";
  let pendingSeparator = false;

  for (const char of value) {
    if (allowed(char)) {
      if (pendingSeparator && slug.length > 0 && slug.length < maxLength) {
        slug += "-";
      }
      pendingSeparator = false;
      if (slug.length < maxLength) {
        slug += char;
      }
      continue;
    }

    pendingSeparator = slug.length > 0;
  }

  return trimTrailingHyphens(slug) || fallback;
}

function trimTrailingHyphens(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "-") {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function isLowerAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}

function isArtifactSegmentChar(char: string): boolean {
  return (
    (char >= "A" && char <= "Z") ||
    (char >= "a" && char <= "z") ||
    (char >= "0" && char <= "9") ||
    char === "." ||
    char === "_" ||
    char === "-"
  );
}
