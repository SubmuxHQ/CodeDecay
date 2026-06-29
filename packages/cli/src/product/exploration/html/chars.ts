export function isHtmlWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f" || char === "\v" || char === "\u00a0";
}

export function isHtmlTagNameChar(char: string): boolean {
  return (
    (char >= "a" && char <= "z") ||
    (char >= "A" && char <= "Z") ||
    (char >= "0" && char <= "9") ||
    char === "-" ||
    char === ":"
  );
}

export function isHtmlAttributeNameChar(char: string): boolean {
  return isHtmlTagNameChar(char) || char === "_" || char === ".";
}
