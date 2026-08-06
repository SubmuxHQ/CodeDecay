import type { ConfigFormat } from "./common";

export interface ContextOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  task?: string | undefined;
  requirements?: string | undefined;
  maxNodes?: number | undefined;
  serviceAction?: "serve" | "health" | "query" | "rebuild" | "reset" | "stop" | undefined;
  sessionId?: string | undefined;
  waitBudgetMs?: number | undefined;
}
