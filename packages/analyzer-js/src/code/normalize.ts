import { replaceQuotedStrings } from "./quotes";
import { collapseWhitespace, stripLineComment } from "./strings";

export function normalizeCodeLine(line: string): string {
  return replaceQuotedStrings(collapseWhitespace(stripLineComment(line.trim())));
}

export function normalizeImplementationLine(line: string): string {
  return normalizeCodeLine(line)
    .replace(/\b(expect|assert|test|it|describe)\b/g, "")
    .trim();
}
