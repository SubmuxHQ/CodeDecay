import { basename } from "node:path";
import type { FileChange } from "@submuxhq/codedecay-core";
import { PACKAGE_METADATA_KEYS } from "./path-constants";
import { normalizePath } from "./path-utils";

export function isPackageMetadataOnlyChange(change: FileChange): boolean {
  if (basename(normalizePath(change.path)).toLowerCase() !== "package.json") {
    return false;
  }

  const meaningfulLines = change.addedLines
    .map((line) => line.content.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));

  if (meaningfulLines.length === 0) {
    return true;
  }

  return meaningfulLines.every((line) => {
    if (/^[{}\[\],]+$/.test(line)) {
      return true;
    }

    const keyMatch = /^"([^"]+)"\s*:/.exec(line);
    if (keyMatch) {
      return PACKAGE_METADATA_KEYS.has(keyMatch[1] ?? "");
    }

    return /^"[^"]+"\s*,?$/.test(line) || /^(true|false|null)\s*,?$/.test(line);
  });
}
