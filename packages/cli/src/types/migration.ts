import type { ConfigFormat } from "./common";
import type { MigrationTargetKind } from "@submuxhq/codedecay-knowledge";

export interface MigrationOptions {
  cwd?: string | undefined;
  files: string[];
  rollbackFiles: string[];
  targetKind: MigrationTargetKind;
  format: ConfigFormat;
  output?: string | undefined;
}
