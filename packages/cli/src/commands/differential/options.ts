import type { DifferentialOptions, DifferentialStatus } from "../../types";

export function requireDifferentialRefs(options: DifferentialOptions): { base: string; head: string } {
  if (!options.base || !options.head) {
    throw new Error("codedecay differential requires --base <ref> and --head <ref>.");
  }

  return {
    base: options.base,
    head: options.head
  };
}

export function isDifferentialFailure(status: DifferentialStatus): boolean {
  return status === "changed" || status === "failed";
}
