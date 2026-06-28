import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export function normalizeArtifactPath(cwd: string, path: string): string {
  const absolutePath = isAbsolute(path) ? path : resolve(cwd, path);
  const relativePath = relative(cwd, absolutePath).replaceAll("\\", "/");
  return relativePath.startsWith("..") ? absolutePath.replaceAll("\\", "/") : relativePath;
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function readLocalFile(cwd: string, path: string): string | undefined {
  try {
    return readFileSync(join(cwd, path), "utf8");
  } catch {
    return undefined;
  }
}

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}
