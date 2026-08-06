import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createDefaultContextServiceBuild } from "./service-build";
import { LocalContextService } from "./service";

const runtimeByRoot = new Map<string, LocalContextService>();

export function getContextService(rootDir: string): LocalContextService | undefined {
  return runtimeByRoot.get(rootDir);
}

export function getOrCreateContextService(rootDir: string, options?: { acquireLock?: boolean | undefined }): LocalContextService {
  const existing = runtimeByRoot.get(rootDir);
  if (existing) {
    return existing;
  }
  const builder = createDefaultContextServiceBuild();
  const service = new LocalContextService({
    rootDir,
    build: (input) => builder.build(input),
    getBuildStats: () => builder.stats(),
    acquireLock: options?.acquireLock ?? true
  });
  runtimeByRoot.set(rootDir, service);
  return service;
}

export async function startContextService(rootDir: string): Promise<LocalContextService> {
  const service = getOrCreateContextService(rootDir);
  await service.start();
  writeContextServiceMarker(rootDir, service.health());
  return service;
}

export async function stopContextService(rootDir: string): Promise<void> {
  const service = runtimeByRoot.get(rootDir);
  if (!service) {
    clearContextServiceMarker(rootDir);
    return;
  }
  await service.stop();
  runtimeByRoot.delete(rootDir);
  clearContextServiceMarker(rootDir);
}

export function writeContextServiceMarker(rootDir: string, health: unknown): string {
  const path = join(rootDir, ".codedecay", "local", "context-service.runtime.json");
  mkdirSync(join(rootDir, ".codedecay", "local"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(health, null, 2)}\n`, "utf8");
  return path;
}

export function readContextServiceMarker(rootDir: string): unknown | undefined {
  const path = join(rootDir, ".codedecay", "local", "context-service.runtime.json");
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function clearContextServiceMarker(rootDir: string): void {
  const path = join(rootDir, ".codedecay", "local", "context-service.runtime.json");
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
}
