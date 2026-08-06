import type { ConfigFormat } from "./common";
import type { StateSpaceTargetKind } from "@submuxhq/codedecay-knowledge";

export interface StateSpaceOptions {
  cwd?: string | undefined;
  experimentFile?: string | undefined;
  surfaceFiles: string[];
  targetKind?: StateSpaceTargetKind | undefined;
  cleanupPlan?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}
