import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENT_SESSION_DIRECTORY, type AgentSession } from "./types";

const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function agentSessionPath(rootDir: string, sessionId: string): string {
  assertSafeSessionId(sessionId);
  return join(rootDir, AGENT_SESSION_DIRECTORY, `${sessionId}.json`);
}

export function agentSessionExists(rootDir: string, sessionId: string): boolean {
  return existsSync(agentSessionPath(rootDir, sessionId));
}

export function loadAgentSession(rootDir: string, sessionId: string): AgentSession {
  const path = agentSessionPath(rootDir, sessionId);
  if (!existsSync(path)) {
    throw new Error(`Agent session "${sessionId}" does not exist. Run codedecay session start first.`);
  }

  return JSON.parse(readFileSync(path, "utf8")) as AgentSession;
}

export function saveNewAgentSession(rootDir: string, session: AgentSession): string {
  const path = agentSessionPath(rootDir, session.id);
  mkdirSync(dirname(path), { recursive: true });

  withAgentSessionWriteLock(path, () => {
    try {
      writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new Error(`Agent session "${session.id}" already exists. Pass a different --session id or continue it.`);
      }
      throw error;
    }
  });

  return path;
}

export function saveExistingAgentSession(rootDir: string, session: AgentSession): string {
  const path = agentSessionPath(rootDir, session.id);
  mkdirSync(dirname(path), { recursive: true });
  withAgentSessionWriteLock(path, () => {
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
    renameSync(tempPath, path);
  });
  return path;
}

function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Agent session id may contain only letters, numbers, dots, underscores, and dashes.");
  }
}

function withAgentSessionWriteLock(path: string, write: () => void): void {
  const lockPath = `${path}.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(`Agent session write is already in progress for ${path}. Retry after the current operation finishes.`);
    }
    throw error;
  }

  try {
    write();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}
