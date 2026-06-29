import { basename, dirname } from "node:path";
import type { FileChange } from "@submuxhq/codedecay-core";

export interface SourceProfile {
  path: string;
  dirname: string;
  basename: string;
  stem: string;
  importPath: string;
}

const GENERIC_SOURCE_STEMS = new Set(["index", "main", "app", "page", "route", "layout", "config"]);

export function createSourceProfile(change: FileChange): SourceProfile {
  const stem = stripExtension(basename(change.path));
  return {
    path: change.path,
    dirname: dirname(change.path),
    basename: basename(change.path),
    stem,
    importPath: stripExtension(change.path)
  };
}

export function referencesAnyChangedSource(
  testChange: FileChange,
  content: string,
  sourceProfiles: SourceProfile[]
): boolean {
  return sourceProfiles.some((profile) => isNearbyTestForSource(testChange.path, profile) || referencesSourceProfile(content, profile));
}

export function referencesSourceProfile(content: string, profile: SourceProfile): boolean {
  const normalized = content.replaceAll("\\", "/");
  const importPathWithoutSrc = profile.importPath.replace(/^src\//, "");
  const hasMeaningfulStem = !GENERIC_SOURCE_STEMS.has(profile.stem.toLowerCase());

  return (
    normalized.includes(profile.path) ||
    normalized.includes(profile.importPath) ||
    normalized.includes(importPathWithoutSrc) ||
    normalized.includes(profile.basename) ||
    (hasMeaningfulStem && new RegExp(`\\b${escapeRegExp(profile.stem)}\\b`, "i").test(normalized))
  );
}

function isNearbyTestForSource(testPath: string, profile: SourceProfile): boolean {
  const testDir = dirname(testPath);
  const testStem = stripExtension(basename(testPath))
    .replace(/(\.|-|_)test$/i, "")
    .replace(/(\.|-|_)spec$/i, "");

  return (
    testStem.includes(profile.stem) ||
    profile.stem.includes(testStem) ||
    testDir.startsWith(profile.dirname) ||
    profile.dirname.startsWith(testDir)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}
