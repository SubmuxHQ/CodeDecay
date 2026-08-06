import { openSync, closeSync, unlinkSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const CONTEXT_SERVICE_LOCK_PATH = ".codedecay/local/context-service.lock";

export interface ContextServiceLockHandle {
  path: string;
  release(): void;
}

/**
 * Cross-process exclusive lock for the local context service.
 * Uses O_EXCL create semantics; stale locks from dead pids are reclaimable.
 */
export function acquireContextServiceLock(
  rootDir: string,
  options: { lockPath?: string | undefined; pid?: number | undefined; staleMs?: number | undefined } = {}
): ContextServiceLockHandle {
  const lockPath = resolve(rootDir, options.lockPath ?? CONTEXT_SERVICE_LOCK_PATH);
  const pid = options.pid ?? process.pid;
  const staleMs = options.staleMs ?? 30 * 60 * 1000;
  mkdirSync(dirname(lockPath), { recursive: true });

  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
    closeSync(fd);
  } catch (error: unknown) {
    if (!isExistError(error)) {
      throw error;
    }
    if (!reclaimStaleLock(lockPath, staleMs)) {
      throw new Error(`Context service lock is held at ${lockPath}. Stop the other process or delete a stale lock.`);
    }
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
    closeSync(fd);
  }

  let released = false;
  return {
    path: lockPath,
    release() {
      if (released) {
        return;
      }
      released = true;
      try {
        unlinkSync(lockPath);
      } catch {
        // Lock may already be gone after crash recovery.
      }
    }
  };
}

function reclaimStaleLock(lockPath: string, staleMs: number): boolean {
  try {
    if (!existsSync(lockPath)) {
      return true;
    }
    const raw = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number; acquiredAt?: string };
    const acquiredAt = raw.acquiredAt ? Date.parse(raw.acquiredAt) : Number.NaN;
    const ageMs = Number.isFinite(acquiredAt) ? Date.now() - acquiredAt : Number.POSITIVE_INFINITY;
    if (ageMs < staleMs && raw.pid && isPidAlive(raw.pid)) {
      return false;
    }
    unlinkSync(lockPath);
    return true;
  } catch {
    try {
      unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isExistError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "EEXIST");
}
