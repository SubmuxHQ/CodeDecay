import type { ConfigFormat } from "./common";

export interface DoctorOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  writeConfigPreview: boolean;
}
