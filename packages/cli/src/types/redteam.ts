import type { RiskLevel } from "@submuxhq/codedecay-core";
import type { RedteamFormat } from "@submuxhq/codedecay-redteam";

export interface RedteamOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: RedteamFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}
