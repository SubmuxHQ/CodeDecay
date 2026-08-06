import type { ConfigFormat } from "./common";
import type { ConcurrencyTargetKind } from "@submuxhq/codedecay-knowledge";

export interface ConcurrencyOptions {
  cwd?: string | undefined;
  experimentFile?: string | undefined;
  surfaceFiles: string[];
  targetKind?: ConcurrencyTargetKind | undefined;
  cleanupPlan?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}
