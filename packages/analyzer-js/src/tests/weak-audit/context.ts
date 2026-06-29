import type { FileChange } from "@submuxhq/codedecay-core";
import { findLineMatches, readChangedFile } from "../line-matches";
import { ASSERTION_PATTERN, MOCK_PATTERN, SNAPSHOT_ASSERTION_PATTERN } from "../weak-patterns";
import type { WeakTestContext } from "./types";

export function createWeakTestContext(rootDir: string, testChange: FileChange): WeakTestContext {
  const content = readChangedFile(rootDir, testChange.path) ?? testChange.addedLines.map((line) => line.content).join("\n");
  const lines = content.split(/\r?\n/);

  return {
    content,
    lines,
    assertionLines: findLineMatches(lines, ASSERTION_PATTERN),
    snapshotLines: findLineMatches(lines, SNAPSHOT_ASSERTION_PATTERN),
    mockLines: findLineMatches(lines, MOCK_PATTERN)
  };
}
