import type { CodeDecayAgentBundleFormat } from "../types";

export interface AgentProcessBundle {
  artifactPath: string;
  absolutePath: string;
  bundleFormat: CodeDecayAgentBundleFormat;
}
