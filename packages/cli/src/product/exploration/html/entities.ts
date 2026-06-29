import { isHtmlWhitespace } from "./chars";

export function decodeHtmlEntities(value: string): string {
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
