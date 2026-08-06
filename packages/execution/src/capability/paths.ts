import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

export interface PathScopeCheck {
  allowed: boolean;
  reason: string;
  resolvedPath?: string | undefined;
}

/**
 * Ensures a requested path stays under one of the allowed roots after
 * normalization and symlink resolution when the path exists.
 */
export function checkPathWithinAllowedRoots(
  requestedPath: string,
  allowedRoots: string[],
  cwd: string
): PathScopeCheck {
  if (allowedRoots.length === 0) {
    return {
      allowed: false,
      reason: "no allowed path roots configured for capability"
    };
  }

  if (requestedPath.trim().length === 0) {
    return {
      allowed: false,
      reason: "empty path is not allowed"
    };
  }

  if (requestedPath.includes("\0")) {
    return {
      allowed: false,
      reason: "path contains NUL byte"
    };
  }

  let resolvedCwd: string;
  try {
    resolvedCwd = existsSync(cwd) ? realpathSync(cwd) : normalize(resolve(cwd));
  } catch {
    return {
      allowed: false,
      reason: "cwd could not be resolved safely"
    };
  }

  const absoluteRequested = isAbsolute(requestedPath)
    ? normalize(requestedPath)
    : resolve(resolvedCwd, requestedPath);

  let resolvedRequested: string;
  try {
    resolvedRequested = resolveExistingPrefix(absoluteRequested);
  } catch {
    return {
      allowed: false,
      reason: "path could not be resolved safely"
    };
  }

  for (const root of allowedRoots) {
    const absoluteRoot = isAbsolute(root) ? normalize(root) : resolve(resolvedCwd, root);
    let resolvedRoot: string;
    try {
      resolvedRoot = resolveExistingPrefix(absoluteRoot);
    } catch {
      continue;
    }

    if (isPathInsideRoot(resolvedRequested, resolvedRoot)) {
      return {
        allowed: true,
        reason: "path is within an allowed root",
        resolvedPath: resolvedRequested
      };
    }
  }

  return {
    allowed: false,
    reason: "path escapes allowed roots",
    resolvedPath: resolvedRequested
  };
}

function resolveExistingPrefix(path: string): string {
  const absolute = normalize(path);
  if (existsSync(absolute)) {
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink() || stats.isDirectory() || stats.isFile()) {
      return realpathSync(absolute);
    }
    return absolute;
  }

  const missing: string[] = [];
  let current = absolute;
  while (current !== dirname(current)) {
    missing.push(basename(current));
    current = dirname(current);
    if (existsSync(current)) {
      return join(realpathSync(current), ...missing.reverse());
    }
  }

  return absolute;
}

function isPathInsideRoot(candidate: string, root: string): boolean {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
  return normalizedCandidate.startsWith(rootWithSep);
}
