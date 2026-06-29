import { isHtmlWhitespace } from "./chars";
import { decodeHtmlEntities } from "./entities";
import { extractHtmlElements, findClosingTagStart, parseHtmlStartTagAt } from "./tags";

export function extractHtmlTitle(html: string): string {
  const title = extractHtmlElements(html, "title")[0];
  return title ? normalizeWhitespace(stripHtml(title.innerHtml)) : "";
}

export function stripHtml(value: string): string {
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
