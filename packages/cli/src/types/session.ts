import type { AgentProfileId, AgentSessionCheckpointKind, AgentSessionFormat } from "@submuxhq/codedecay-agent";

export type SessionCommand = "start" | "context" | "checkpoint" | "finish";

export interface SessionOptions {
  command: SessionCommand;
  cwd?: string | undefined;
  format: AgentSessionFormat;
  output?: string | undefined;
  session?: string | undefined;
  task?: string | undefined;
  requirements?: string | undefined;
  profile: AgentProfileId;
  maxNodes?: number | undefined;
  maxChars?: number | undefined;
  checkpointKind?: Exclude<AgentSessionCheckpointKind, "finish"> | undefined;
  summary?: string | undefined;
  agentOutput?: string | undefined;
}
