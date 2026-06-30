import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import type { DriveAgentInput } from "./types";

export async function driveAgent(input: DriveAgentInput) {
  return await runConfiguredCommand({
    command: input.command,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    stdin: input.bundle,
    safety: input.safety,
    env: {
      CODEDECAY_LOOP: "1",
      CODEDECAY_AGENT_OUTPUT_UNTRUSTED: "1"
    }
  });
}
