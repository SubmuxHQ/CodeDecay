import type { CodeDecayCoverageFailOn } from "../types";

export const COVERAGE_HARNESS_NAME = "coverage";
export const DEFAULT_COVERAGE_TIMEOUT_MS = 120_000;
export const DEFAULT_COVERAGE_FAIL_ON: CodeDecayCoverageFailOn = "none";
export const DEFAULT_COVERAGE_REPORT_PATHS = [
  "coverage/coverage-final.json",
  "coverage-final.json",
  "coverage/lcov.info",
  "lcov.info"
];
export const DEFAULT_COVERAGE_DISCOVERY_DIRS = ["coverage", ".v8-coverage", ".nyc_output"];
