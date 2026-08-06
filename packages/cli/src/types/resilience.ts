import type { ConfigFormat } from "./common";
import type { ResilienceTargetKind } from "@submuxhq/codedecay-knowledge";

export interface ResilienceOptions {
  cwd?: string | undefined;
  experimentFile?: string | undefined;
  surfaceFiles: string[];
  targetKind?: ResilienceTargetKind | undefined;
  cleanupPlan?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}
