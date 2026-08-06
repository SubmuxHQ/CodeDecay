const SHELL_SUBSTITUTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\$\(/,
    reason: "shell command substitution $(...)"
  },
  {
    pattern: /`/,
    reason: "shell backtick substitution"
  },
  {
    pattern: /\$\{/,
    reason: "shell parameter expansion ${...}"
  },
  {
    pattern: /\$[A-Za-z_][A-Za-z0-9_]*/,
    reason: "shell environment expansion"
  }
];

/**
 * Rejects shell interpolation/substitution before any spawn.
 * Configured commands must be literal argv strings without expansion.
 */
export function detectShellSubstitution(command: string): string | undefined {
  for (const entry of SHELL_SUBSTITUTION_PATTERNS) {
    if (entry.pattern.test(command)) {
      return entry.reason;
    }
  }

  return undefined;
}
