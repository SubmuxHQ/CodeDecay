export function slugify(value: string, fallbackIndex: number): string {
  const slugParts: string[] = [];
  let previousWasSeparator = true;

  for (const char of value.trim().toLowerCase()) {
    if (isAsciiLetterOrDigit(char)) {
      slugParts.push(char);
      previousWasSeparator = false;
      continue;
    }

    if (!previousWasSeparator) {
      slugParts.push("-");
      previousWasSeparator = true;
    }
  }

  if (slugParts.at(-1) === "-") {
    slugParts.pop();
  }

  const slug = slugParts.join("");

  return slug || String(fallbackIndex);
}

function isAsciiLetterOrDigit(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}
