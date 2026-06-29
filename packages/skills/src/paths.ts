import { sep } from "node:path";

export function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
