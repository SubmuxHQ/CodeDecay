export function replaceQuotedStrings(value: string): string {
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (!isQuote(value[cursor])) {
      parts.push(value[cursor] ?? "");
      cursor += 1;
      continue;
    }

    const quoted = readQuotedValue(value, cursor);
    if (!quoted) {
      parts.push(value[cursor] ?? "");
      cursor += 1;
      continue;
    }

    parts.push("\"\"");
    cursor = quoted.endIndex + 1;
  }

  return parts.join("");
}

function readQuotedValue(value: string, startIndex: number): { value: string; endIndex: number } | undefined {
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

function isQuote(value: string | undefined): boolean {
  return value === "\"" || value === "'" || value === "`";
}
