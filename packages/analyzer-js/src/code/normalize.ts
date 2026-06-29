export function normalizeCodeLine(line: string): string {
  return replaceQuotedStrings(collapseWhitespace(stripLineComment(line.trim())));
}

export function normalizeImplementationLine(line: string): string {
  return normalizeCodeLine(line)
    .replace(/\b(expect|assert|test|it|describe)\b/g, "")
    .trim();
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

function stripLineComment(value: string): string {
  const commentIndex = value.indexOf("//");
  return commentIndex === -1 ? value : value.slice(0, commentIndex);
}

function collapseWhitespace(value: string): string {
  const parts: string[] = [];
  let previousWasWhitespace = false;

  for (const char of value) {
    if (isWhitespace(char)) {
      if (!previousWasWhitespace && parts.length > 0) {
        parts.push(" ");
      }
      previousWasWhitespace = true;
      continue;
    }

    parts.push(char);
    previousWasWhitespace = false;
  }

  if (parts.at(-1) === " ") {
    parts.pop();
  }

  return parts.join("");
}

function replaceQuotedStrings(value: string): string {
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

function isQuote(value: string | undefined): boolean {
  return value === "\"" || value === "'" || value === "`";
}

function isWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}
