export const COMMAND_ORDER = ["analyze", "snapshot", "redteam", "revalidate", "llm-review", "agent", "config", "memory", "memory-import", "memory-learn", "execute", "differential", "product", "dashboard", "mcp"] as const;
export const UTILITY_COMMAND_ORDER = ["help", "man", "update", "uninstall", "version"] as const;
export const ROOT_FLAG_ALIASES = ["--help", "-h", "--version", "-V"] as const;
