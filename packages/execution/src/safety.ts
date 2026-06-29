import type { CommandSafetyCheck } from "./types";
import { validateNonEmptyString } from "./validation";

const UNSAFE_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+(?:-[^\s]*[rf][^\s]*|-[^\s]*r[^\s]*\s+-[^\s]*f[^\s]*|-[^\s]*f[^\s]*\s+-[^\s]*r[^\s]*)/i,
    reason: "recursive or forced file deletion"
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: "destructive git reset"
  },
  {
    pattern: /\bgit\s+clean\s+-[^\s]*f/i,
    reason: "destructive git clean"
  },
  {
    pattern: /\bgit\s+push\b/i,
    reason: "remote git push"
  },
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+publish\b/i,
    reason: "package publish"
  },
  {
    pattern: /\b(?:vercel|netlify|fly|railway|wrangler)\s+(?:deploy|up)\b/i,
    reason: "production deployment command"
  },
  {
    pattern: /\bkubectl\s+(?:apply|delete|replace|rollout|scale)\b/i,
    reason: "cluster mutation command"
  },
  {
    pattern: /\bterraform\s+(?:apply|destroy)\b/i,
    reason: "infrastructure mutation command"
  },
  {
    pattern: /\bdocker\s+compose\s+down\b.*\s-v\b/i,
    reason: "container volume deletion"
  },
  {
    pattern: /\b(?:prisma|drizzle-kit|supabase)\s+(?:migrate\s+deploy|db\s+push|push)\b/i,
    reason: "database migration or push command"
  },
  {
    pattern: /\bgh\s+release\s+(?:create|delete)\b/i,
    reason: "GitHub release mutation"
  }
];

export function checkCommandSafety(command: string): CommandSafetyCheck {
  validateNonEmptyString(command, "Command");

  for (const unsafe of UNSAFE_COMMAND_PATTERNS) {
    if (unsafe.pattern.test(command)) {
      return {
        safe: false,
        reason: unsafe.reason
      };
    }
  }

  return {
    safe: true
  };
}
