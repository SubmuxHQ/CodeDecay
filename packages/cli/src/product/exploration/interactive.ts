import type {
  ProductBlockedAction,
  ProductExplorerOptions,
  ProductFlowLink,
  ProductInteractiveElement
} from "../../types";
import {
  extractHtmlElements,
  extractHtmlStartTags,
  normalizeWhitespace,
  parseHtmlAttributes,
  stripHtml
} from "./html";

export type ResolveProductUrl = (value: string, baseUrl: string) => string | undefined;

export interface ProductInteractionState {
  recordedActions: number;
  skippedActions: number;
  blockedActions: ProductBlockedAction[];
}

export function extractProductLinks(input: {
  html: string;
  baseUrl: string;
  origin: string;
  resolveUrl: ResolveProductUrl;
}): ProductFlowLink[] {
  const links: ProductFlowLink[] = [];
  const seen = new Set<string>();

  for (const element of extractHtmlElements(input.html, "a")) {
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const rawHref = attrs.href;
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) {
      continue;
    }

    const href = input.resolveUrl(rawHref, input.baseUrl);
    if (!href || seen.has(href)) {
      continue;
    }

    seen.add(href);
    const sameOrigin = new URL(href).origin === input.origin;
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

export function extractProductInteractiveElements(input: {
  html: string;
  pageUrl: string;
  baseUrl: string;
  links: ProductFlowLink[];
  options: ProductExplorerOptions;
  state: ProductInteractionState;
  resolveUrl: ResolveProductUrl;
}): ProductInteractiveElement[] {
  const interactiveElements: ProductInteractiveElement[] = [];

  for (const link of input.links) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.pageUrl, {
      kind: "link",
      selector: link.selector,
      name: link.text,
      action: link.href,
      destructive: false,
      blocked: false
    });
  }

  for (const form of extractProductForms(input.html, input.baseUrl, input.resolveUrl)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.pageUrl, form);
  }

  for (const button of extractProductButtons(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.pageUrl, button);
  }

  for (const inputElement of extractProductInputs(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.pageUrl, inputElement);
  }

  return interactiveElements;
}

function appendInteractiveElement(
  elements: ProductInteractiveElement[],
  state: ProductInteractionState,
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

function extractProductForms(html: string, baseUrl: string, resolveUrl: ResolveProductUrl): ProductInteractiveElement[] {
  const forms: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlElements(html, "form")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const method = (attrs.method ?? "get").toLowerCase();
    const rawAction = attrs.action ?? baseUrl;
    const action = resolveUrl(rawAction, baseUrl) ?? rawAction;
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

function isDestructiveText(value: string): boolean {
  return /\b(delete|remove|destroy|drop|reset|purchase|payment|checkout|confirm|submit|disable|revoke|archive)\b/i.test(value);
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
