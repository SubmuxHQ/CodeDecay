export function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
