import type { ProductInteractiveElement } from "../../../types";
import {
  extractHtmlElements,
  extractHtmlStartTags,
  parseHtmlAttributes,
  stripHtml
} from "../html";
import { accessibleName, isDestructiveText, selectorFromAttrs, type ResolveProductUrl } from "./shared";

export function extractProductForms(html: string, baseUrl: string, resolveUrl: ResolveProductUrl): ProductInteractiveElement[] {
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

export function extractProductButtons(html: string): ProductInteractiveElement[] {
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

export function extractProductInputs(html: string): ProductInteractiveElement[] {
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
