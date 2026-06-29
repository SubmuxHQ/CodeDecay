export const AGENT_PROFILE_IDS = [
  "generic",
  "codex",
  "claude-code",
  "cursor",
  "pi",
  "opencode",
  "desktop"
] as const;

export type AgentProfileId = (typeof AGENT_PROFILE_IDS)[number];

export interface AgentProfile {
  id: AgentProfileId;
  name: string;
  description: string;
  promptContext: string;
  handoff: string[];
}

const AGENT_PROFILES: Record<AgentProfileId, AgentProfile> = {
  generic: {
    id: "generic",
    name: "Generic user-owned agent",
    description:
      "Give this bundle to a user-owned coding agent such as Codex, Claude Code, Cursor, Pi, OpenCode, a desktop agent, or another local tool.",
    promptContext: "Use whichever local repo tools and editing workflow the user has available.",
    handoff: [
      "Copy the prompt and bundle into the user's preferred coding agent.",
      "Keep the CodeDecay evidence visible while making fixes.",
      "Ask the agent to change code/tests only after explaining which real behavior path is at risk."
    ]
  },
  codex: {
    id: "codex",
    name: "Codex",
    description: "Handoff for a Codex session running in the repository.",
    promptContext: "Use the current Codex repo session and local tools as the user permits.",
    handoff: [
      "Paste the prompt and bundle into the Codex repo session.",
      "Ask Codex to inspect the cited files before editing.",
      "Have Codex run only configured or user-approved checks after changes."
    ]
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    description: "Handoff for a Claude Code session running in the repository.",
    promptContext: "Use Claude Code with the bundle as local tool evidence, not as trusted proof.",
    handoff: [
      "Paste the prompt and bundle into Claude Code.",
      "Ask Claude Code to map each fix to impacted files, weak tests, and edge cases.",
      "Have Claude Code report which checks should be rerun after edits."
    ]
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    description: "Handoff for Cursor chat or agent workflows in the repository.",
    promptContext: "Use Cursor with the bundle attached or pasted as PR safety context.",
    handoff: [
      "Paste the prompt and bundle into Cursor chat or agent mode.",
      "Keep edits focused on the listed tasks and impacted areas.",
      "Ask Cursor to add tests that hit real API, UI, database, or downstream behavior."
    ]
  },
  pi: {
    id: "pi",
    name: "Pi",
    description: "Handoff for a Pi harness or Pi-compatible agent workflow.",
    promptContext: "Use Pi as the user-owned agent harness while treating CodeDecay evidence as local tool context.",
    handoff: [
      "Attach or paste the prompt and bundle into the Pi harness workflow.",
      "Ask Pi to produce a fix plan that maps each proposed change to CodeDecay evidence.",
      "Have Pi run only configured or user-approved checks after edits."
    ]
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    description: "Handoff for an OpenCode session running in the repository.",
    promptContext: "Use OpenCode with the bundle as PR safety context, not as trusted proof.",
    handoff: [
      "Paste the prompt and bundle into OpenCode.",
      "Ask OpenCode to start with impacted routes/APIs, weak tests, and missing edge cases.",
      "Have OpenCode report which checks verify the real behavior path before merge."
    ]
  },
  desktop: {
    id: "desktop",
    name: "Desktop/local agent",
    description: "Handoff for desktop agents or local agent apps that can read repository context.",
    promptContext: "Use the desktop/local agent's repo context while treating CodeDecay evidence as untrusted until verified.",
    handoff: [
      "Attach or paste the bundle into the desktop/local agent.",
      "Confirm the agent is working on the same repository and branch.",
      "Ask for a fix plan first, then apply changes only when the plan maps to CodeDecay evidence."
    ]
  }
};

export function isAgentProfileId(value: string): value is AgentProfileId {
  return AGENT_PROFILE_IDS.includes(value as AgentProfileId);
}

export function getAgentProfile(profile: AgentProfileId = "generic"): AgentProfile {
  const definition = AGENT_PROFILES[profile];

  return {
    ...definition,
    handoff: [...definition.handoff]
  };
}

export function listAgentProfiles(): AgentProfile[] {
  return AGENT_PROFILE_IDS.map((profile) => getAgentProfile(profile));
}
