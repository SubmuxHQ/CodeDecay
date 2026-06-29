import { isHtmlAttributeNameChar, isHtmlWhitespace } from "./chars";
import { decodeHtmlEntities } from "./entities";

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
