import { resolve } from "node:path";
import {
  getOrCreateContextService,
  startContextService,
  writeContextServiceMarker
} from "@submuxhq/codedecay-knowledge";
import type { StartMcpServerOptions } from "../server/types";

export interface ContextServiceToolInput {
  cwd?: string | undefined;
  sessionId?: string | undefined;
  task?: string | undefined;
  waitBudgetMs?: number | undefined;
  operation?: "health" | "query" | "rebuild" | "start" | undefined;
}

export async function runContextServiceTool(
  options: StartMcpServerOptions,
  input: ContextServiceToolInput
): Promise<string> {
  const rootDir = resolve(options.cwd ?? process.cwd(), input.cwd ?? ".");
  const operation = input.operation ?? "health";

  if (operation === "start") {
    const service = await startContextService(rootDir);
    writeContextServiceMarker(rootDir, service.health());
    return JSON.stringify({ status: "started", health: service.health() }, null, 2);
  }

  const service = getOrCreateContextService(rootDir, { acquireLock: operation === "rebuild" });
  if (service.health().cacheGeneration === 0 && operation !== "rebuild") {
    await service.rebuild("initial");
  }

  if (operation === "rebuild") {
    await service.rebuild("manual-rebuild");
  }

  if (operation === "query") {
    const result = await service.query({
      waitBudgetMs: input.waitBudgetMs ?? 250,
      sessionId: input.sessionId,
      task: input.task
    });
    writeContextServiceMarker(rootDir, service.health());
    return JSON.stringify(result, null, 2);
  }

  const health = service.health();
  writeContextServiceMarker(rootDir, health);
  return JSON.stringify(health, null, 2);
}
