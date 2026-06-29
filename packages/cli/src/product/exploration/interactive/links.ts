import type { ProductFlowLink } from "../../../types";
import {
  extractHtmlElements,
  parseHtmlAttributes,
  stripHtml
} from "../html";
import { accessibleName, escapeSelectorValue, type ResolveProductUrl } from "./shared";

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
