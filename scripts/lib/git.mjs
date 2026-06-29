import { spawnSync } from "node:child_process";

export function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }

  return result;
}

export function runGitOutput(cwd, args) {
  return runGit(cwd, args).stdout;
}

export function initFixtureGitRepo(
  root,
  {
    initialBranch = "main",
    userEmail = "codedecay@example.com",
    userName = "CodeDecay Demo",
    commitMessage = "baseline"
  } = {}
) {
  runGit(root, initialBranch ? ["init", "-b", initialBranch] : ["init"]);
  runGit(root, ["config", "user.email", userEmail]);
  runGit(root, ["config", "user.name", userName]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", commitMessage]);
  return runGitOutput(root, ["rev-parse", "HEAD"]).trim();
}
