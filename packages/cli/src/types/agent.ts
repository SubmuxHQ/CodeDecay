import type { AgentProfileId, AgentTaskBundleFormat } from "@submuxhq/codedecay-agent";
import type { RiskLevel } from "@submuxhq/codedecay-core";
import type { RedteamTaskSource } from "@submuxhq/codedecay-redteam";

export interface AgentOptions {
  mode: "task-bundle" | "preflight";
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: AgentTaskBundleFormat;
  profile: AgentProfileId;
  task?: string | undefined;
  requirements?: string | undefined;
  investigate?: boolean | undefined;
  output?: string | undefined;
  filterSource?: RedteamTaskSource | undefined;
  filterPriority?: RiskLevel | undefined;
  filterFile?: string | undefined;
}
