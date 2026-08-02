import type { ConfigFormat } from "./common";

export interface RuntimeOptions {
  cwd?: string | undefined;
  telemetry?: string | undefined;
  errors?: string | undefined;
  topology?: string | undefined;
  headRevision?: string | undefined;
  environment?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}
