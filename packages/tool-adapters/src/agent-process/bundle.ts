import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { optionalStringValue } from "../shared/values";
import type { CodeDecayAgentBundleFormat, CodeDecayAgentProfile } from "../types";
import { AGENT_PROCESS_BUNDLE_DIR } from "./constants";
import type { AgentProcessBundle } from "./types";
import { isAgentBundleFormat } from "./validation";

export function writeAgentProcessBundle(
  cwd: string,
  context: Record<string, unknown> | undefined,
  profile: CodeDecayAgentProfile,
  format: CodeDecayAgentBundleFormat
): AgentProcessBundle {
  const contextBundle = optionalStringValue(context?.agentBundle);
  const rawContextFormat = context?.agentBundleFormat;
  const contextFormat = isAgentBundleFormat(rawContextFormat) ? rawContextFormat : format;
  const bundleFormat = contextFormat ?? format;
  const artifactPath = join(AGENT_PROCESS_BUNDLE_DIR, bundleFormat === "json" ? "bundle.json" : "bundle.md");
  const absolutePath = join(cwd, artifactPath);
  const contents = contextBundle ?? fallbackAgentProcessBundle(profile, bundleFormat);

  mkdirSync(join(cwd, AGENT_PROCESS_BUNDLE_DIR), { recursive: true });
  writeFileSync(absolutePath, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");

  return {
    artifactPath,
    absolutePath,
    bundleFormat
  };
}

function fallbackAgentProcessBundle(profile: CodeDecayAgentProfile, format: CodeDecayAgentBundleFormat): string {
  if (format === "json") {
    return JSON.stringify(
      {
        tool: "CodeDecay",
        mode: "agent-task-bundle",
        agentProfile: { id: profile },
        notes: [
          "No CodeDecay analysis bundle was provided by the caller.",
          "Treat this file as local context only; agent output is untrusted until verified."
        ]
      },
      null,
      2
    );
  }

  return [
    "## CodeDecay Agent Task Bundle",
    "",
    `Profile: ${profile}`,
    "",
    "No CodeDecay analysis bundle was provided by the caller.",
    "Treat this file as local context only; agent output is untrusted until verified."
  ].join("\n");
}
