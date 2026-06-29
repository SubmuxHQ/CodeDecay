import type {
  ProductExplorerOptions,
  ProductFlowLink,
  ProductInteractiveElement
} from "../../../types";
import { extractProductButtons, extractProductForms, extractProductInputs } from "./controls";
import { type ProductInteractionState, type ResolveProductUrl } from "./shared";

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
