const UNAMBIGUOUS_TEST_DIRECTORIES = new Set(["__tests__", "__specs__"]);
const CONVENTIONAL_TEST_DIRECTORIES = new Set(["test", "tests", "spec", "specs", "e2e", "integration"]);
const WORKSPACE_CONTAINER_DIRECTORIES = new Set(["apps", "libs", "modules", "packages", "services"]);
const TEST_FILE_STEM_PATTERN = /(^|[._-])(test|spec|e2e|integration)$/i;

export function isTestFilePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const directorySegments = segments.slice(0, -1);
  const fileName = segments.at(-1) ?? normalized;
  const stem = fileName.replace(/\.[^.]+$/, "");

  if (TEST_FILE_STEM_PATTERN.test(stem) || stem.startsWith("test_")) {
    return true;
  }

  if (directorySegments.some((segment) => UNAMBIGUOUS_TEST_DIRECTORIES.has(segment))) {
    return true;
  }

  const sourceRootIndex = directorySegments.indexOf("src");
  return directorySegments.some((segment, index) => {
    if (!CONVENTIONAL_TEST_DIRECTORIES.has(segment)) {
      return false;
    }

    // A conventional test root before src remains a test, while src/tests is
    // ambiguous production source. Do not mistake a workspace package name for a test root.
    const isWorkspacePackageName =
      index > 0 &&
      WORKSPACE_CONTAINER_DIRECTORIES.has(directorySegments[index - 1] ?? "") &&
      directorySegments[index + 1] === "src";
    return !isWorkspacePackageName && (sourceRootIndex === -1 || index < sourceRootIndex);
  });
}
