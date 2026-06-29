import { extname } from "node:path";
import type {
  FileChange,
  LanguageAnalysisSummary,
  LanguageFileSupport,
  LanguageParserCapability
} from "@submuxhq/codedecay-core";
import { isSourcePath } from "../classifiers/paths";

const JS_TS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

const JS_TS_CAPABILITIES: LanguageParserCapability[] = [
  "path-classification",
  "diff-line-analysis",
  "route-impact",
  "runtime-coverage",
  "test-audit",
  "function-metrics",
  "security-matchers"
];

const LIMITED_CAPABILITIES: LanguageParserCapability[] = [
  "path-classification",
  "diff-line-analysis",
  "runtime-coverage",
  "test-audit"
];

export function analyzeLanguageSupport(changedFiles: FileChange[]): LanguageAnalysisSummary {
  const files = changedFiles
    .filter((change) => change.status !== "deleted" && isSourcePath(change.path))
    .map((change) => classifyLanguageSupport(change.path))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    files,
    supportedFiles: files.filter((file) => file.status === "supported").map((file) => file.path),
    limitedFiles: files.filter((file) => file.status === "limited").map((file) => file.path),
    unsupportedFiles: files.filter((file) => file.status === "unsupported").map((file) => file.path)
  };
}

export function classifyLanguageSupport(path: string): LanguageFileSupport {
  const extension = extname(path).toLowerCase();

  if (JS_TS_EXTENSIONS.has(extension)) {
    return {
      path,
      language: extension === ".ts" || extension === ".tsx" ? "typescript" : "javascript",
      status: "supported",
      parser: "typescript-estree",
      capabilities: JS_TS_CAPABILITIES
    };
  }

  if (extension === ".py") {
    return {
      path,
      language: "python",
      status: "limited",
      parser: "none",
      capabilities: LIMITED_CAPABILITIES,
      limitation: "Python files use path, diff, coverage, and test-audit signals until a Python parser adapter is added."
    };
  }

  return {
    path,
    language: extension === "" ? "unknown" : extension.slice(1),
    status: "unsupported",
    parser: "none",
    capabilities: ["path-classification"],
    limitation: "No parser adapter is registered for this source file type."
  };
}
