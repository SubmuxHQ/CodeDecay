import {
  CONTEXT_SERVICE_STATE_PATH,
  acquireContextServiceLock,
  createDefaultContextServiceBuild,
  getOrCreateContextService,
  LocalContextService
} from "../../src/index";

export {
  CONTEXT_SERVICE_STATE_PATH,
  acquireContextServiceLock,
  createDefaultContextServiceBuild,
  LocalContextService
};

/** In-process stand-in for MCP context_service tool used by UAT. */
export async function runContextServiceToolLike(
  rootDir: string,
  input: { operation?: "health" | "query" | "rebuild" | "start"; sessionId?: string; task?: string }
): Promise<string> {
  const operation = input.operation ?? "health";
  const service = getOrCreateContextService(rootDir, { acquireLock: false });
  if (service.health().cacheGeneration === 0) {
    await service.rebuild("initial");
  }
  if (operation === "rebuild") {
    await service.rebuild("manual-rebuild");
  }
  if (operation === "query") {
    return JSON.stringify(
      await service.query({
        sessionId: input.sessionId,
        task: input.task,
        waitBudgetMs: 100
      }),
      null,
      2
    );
  }
  return JSON.stringify(service.health(), null, 2);
}
