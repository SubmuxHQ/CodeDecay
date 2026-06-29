import type { AgentProfileId, AgentTaskBundleFormat } from "@submuxhq/codedecay-agent";

export interface AgentOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: AgentTaskBundleFormat;
  profile: AgentProfileId;
  output?: string | undefined;
}
