export type SandboxMode = "off" | "best-effort" | "required";

export interface ProcessIsolationEvaluation {
  platform: NodeJS.Platform;
  supported: boolean;
  mechanisms: string[];
  weakerIsolation: boolean;
  notes: string[];
}

export interface SandboxEnforcement {
  allowed: boolean;
  mode: SandboxMode;
  reason: string;
  isolation: ProcessIsolationEvaluation;
}

/**
 * Evaluate maintained process-isolation mechanisms available to CodeDecay.
 * CodeDecay does not claim a full OS sandbox on every platform; missing
 * features must never silently imply full isolation.
 */
export function evaluateProcessIsolation(platform: NodeJS.Platform = process.platform): ProcessIsolationEvaluation {
  const mechanisms: string[] = [];
  const notes: string[] = [];

  // Baseline bounds available through packages/execution spawn helpers.
  mechanisms.push("timeout-kill", "output-size-bounds", "capability-allowlist");

  if (platform === "linux" || platform === "darwin") {
    mechanisms.push("posix-process-tree");
    notes.push(
      `${platform} currently lacks a CodeDecay-managed hardened sandbox (no seccomp/seatbelt profile); isolation is visibly weaker than a full OS sandbox.`
    );
  } else if (platform === "win32") {
    notes.push("Windows process-tree isolation is limited; treat isolation as weaker.");
  } else {
    notes.push(`Unsupported platform '${platform}' for hardened process isolation.`);
  }

  // Hardened sandbox (seatbelt/seccomp/landlock) is not yet implemented.
  const hardenedSandboxAvailable = false;
  const supported = mechanisms.length > 0;
  const weakerIsolation = !hardenedSandboxAvailable;

  return {
    platform,
    supported,
    mechanisms,
    weakerIsolation,
    notes
  };
}


/**
 * Enforce sandbox policy. `required` degrades to blocked when isolation is
 * unsupported or visibly weaker. `best-effort` allows with an explicit weaker
 * isolation reason. `off` skips enforcement.
 */
export function enforceSandboxPolicy(
  mode: SandboxMode = "best-effort",
  platform: NodeJS.Platform = process.platform
): SandboxEnforcement {
  const isolation = evaluateProcessIsolation(platform);

  if (mode === "off") {
    return {
      allowed: true,
      mode,
      reason: "sandbox mode is off; capability allowlists still apply",
      isolation
    };
  }

  if (mode === "required" && (isolation.weakerIsolation || !isolation.supported)) {
    return {
      allowed: false,
      mode,
      reason:
        "sandbox mode is required but process isolation is unsupported or weaker on this platform; degrading to blocked (never silent full access)",
      isolation
    };
  }

  if (isolation.weakerIsolation) {
    return {
      allowed: true,
      mode,
      reason: "sandbox best-effort with visibly weaker isolation; capability allowlists still apply",
      isolation
    };
  }

  return {
    allowed: true,
    mode,
    reason: "sandbox best-effort isolation mechanisms are available",
    isolation
  };
}
