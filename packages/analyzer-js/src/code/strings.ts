export function stripLineComment(value: string): string {
  const commentIndex = value.indexOf("//");
  return commentIndex === -1 ? value : value.slice(0, commentIndex);
}

export function collapseWhitespace(value: string): string {
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

function isWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}
