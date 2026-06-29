import type { CodeDecayToolSeverity } from "../types";

export const SEMGREP_HARNESS_NAME = "semgrep";
export const DEFAULT_SEMGREP_TIMEOUT_MS = 180_000;
export const DEFAULT_SEMGREP_FAIL_ON_SEVERITY: CodeDecayToolSeverity = "high";
export const LOCAL_SEMGREP_CONFIG_CANDIDATES = [".semgrep.yml", ".semgrep.yaml", ".semgrep", "semgrep.yml", "semgrep.yaml"];
