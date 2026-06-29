export interface ObjectPropertyValue {
  kind: "array" | "string";
  value: string;
}

export function findObjectPropertyValue(body: string, propertyName: string): ObjectPropertyValue | undefined {
  const lowerBody = body.toLowerCase();
  const lowerPropertyName = propertyName.toLowerCase();
  let searchFrom = 0;

  while (searchFrom < body.length) {
    const propertyIndex = lowerBody.indexOf(lowerPropertyName, searchFrom);
    if (propertyIndex === -1) {
      return undefined;
    }

    searchFrom = propertyIndex + lowerPropertyName.length;

    if (isIdentifierCharacter(body.charAt(propertyIndex - 1)) || isIdentifierCharacter(body.charAt(searchFrom))) {
      continue;
    }

    let cursor = skipWhitespace(body, searchFrom);
    if (body[cursor] !== ":") {
      continue;
    }

    cursor = skipWhitespace(body, cursor + 1);
    const current = body[cursor];

    if (current === "[") {
      const end = findClosingArrayBracket(body, cursor);
      if (end !== -1) {
        return { kind: "array", value: body.slice(cursor + 1, end) };
      }
    }

    if (isQuote(current)) {
      const quoted = readQuotedValue(body, cursor);
      if (quoted) {
        return { kind: "string", value: quoted.value };
      }
    }
  }

  return undefined;
}

export function readQuotedValue(value: string, startIndex: number): { value: string; endIndex: number } | undefined {
  const quote = value[startIndex];
  if (!isQuote(quote)) {
    return undefined;
  }

  let cursor = startIndex + 1;
  let result = "";

  while (cursor < value.length) {
    const current = value[cursor];
    if (current === "\\") {
      if (cursor + 1 < value.length) {
        result += value[cursor + 1];
        cursor += 2;
        continue;
      }
      break;
    }

    if (current === quote) {
      return { value: result, endIndex: cursor };
    }

    result += current;
    cursor += 1;
  }

  return undefined;
}

export function isQuote(value: string | undefined): boolean {
  return value === "\"" || value === "'" || value === "`";
}

function findClosingArrayBracket(value: string, startIndex: number): number {
  let depth = 0;
  let cursor = startIndex;

  while (cursor < value.length) {
    const current = value[cursor];
    if (isQuote(current)) {
      const quoted = readQuotedValue(value, cursor);
      cursor = quoted ? quoted.endIndex + 1 : cursor + 1;
      continue;
    }

    if (current === "[") {
      depth += 1;
    } else if (current === "]") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  return -1;
}

function skipWhitespace(value: string, startIndex: number): number {
  let cursor = startIndex;
  while (cursor < value.length && isWhitespace(value[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function isIdentifierCharacter(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    value === "_" ||
    value === "$"
  );
}

function isWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}
