export interface ParsedHtmlElement {
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

export function extractHtmlTitle(html: string): string {
  const title = extractHtmlElements(html, "title")[0];
  return title ? normalizeWhitespace(stripHtml(title.innerHtml)) : "";
}

export function parseHtmlAttributes(raw: string): Record<string, string> {
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
