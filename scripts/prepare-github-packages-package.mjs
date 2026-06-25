import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(readArg("--source-root") ?? defaultRepoRoot);
const cliPackageDir = join(repoRoot, "packages", "cli");
const defaultOutDir = join(defaultRepoRoot, ".codedecay", "github-packages", "codedecay");
const outDir = resolve(readArg("--out") ?? defaultOutDir);

const sourcePackageJson = JSON.parse(readFileSync(join(cliPackageDir, "package.json"), "utf8"));
const githubPackageJson = {
  ...sourcePackageJson,
  name: "@submuxhq/codedecay",
  publishConfig: {
    registry: "https://npm.pkg.github.com"
  }
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(cliPackageDir, "dist"), join(outDir, "dist"), { recursive: true });
cpSync(join(cliPackageDir, "README.md"), join(outDir, "README.md"));
cpSync(join(cliPackageDir, "LICENSE"), join(outDir, "LICENSE"));
writeFileSync(join(outDir, "package.json"), `${JSON.stringify(githubPackageJson, null, 2)}\n`);

console.log(`Prepared ${githubPackageJson.name}@${githubPackageJson.version}`);
console.log(outDir);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}
