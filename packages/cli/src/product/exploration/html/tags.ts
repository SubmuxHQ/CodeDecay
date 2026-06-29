import { isHtmlTagNameChar, isHtmlWhitespace } from "./chars";
import type { ParsedHtmlElement, ParsedHtmlStartTag } from "./types";

export function extractHtmlElements(html: string, tagName: string): ParsedHtmlElement[] {
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

export function extractHtmlStartTags(html: string, tagName: string): Array<Omit<ParsedHtmlElement, "innerHtml">> {
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

export function parseHtmlStartTagAt(html: string, tagStart: number): ParsedHtmlStartTag | undefined {
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

export function findClosingTagStart(html: string, tagName: string, start: number): number {
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
