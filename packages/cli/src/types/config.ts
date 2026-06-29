import type { ConfigFormat } from "./common";

export interface ConfigOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
}
