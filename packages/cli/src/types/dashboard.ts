import type { ConfigFormat } from "./common";

export interface DashboardOptions {
  cwd?: string | undefined;
  output?: string | undefined;
  format: ConfigFormat;
  inputPaths: string[];
}
