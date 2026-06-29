import { runGit } from "./command";

export function getRepoRoot(cwd: string): string {
  const output = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const repoRoot = output.trim();
  if (!repoRoot) {
    throw new Error(`Not a git repository: ${cwd}`);
  }

  return repoRoot;
}

export function readFileAtRef(cwd: string, ref: string, path: string): string | undefined {
  try {
    return runGit(cwd, ["show", `${ref}:${path}`]);
  } catch {
    return undefined;
  }
}
