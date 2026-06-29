import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT_SKILLS_DIR, SKILL_FILENAME } from "./constants";
import { extractSummary, extractTitle, titleFromId } from "./markdown";
import { normalizePath } from "./paths";
import type { CodeDecaySkill, LoadedCodeDecaySkills, LoadCodeDecaySkillsOptions } from "./types";

export function loadCodeDecaySkills(options: LoadCodeDecaySkillsOptions): LoadedCodeDecaySkills {
  const sourceDir = join(options.cwd, DEFAULT_SKILLS_DIR);
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    return {
      skills: []
    };
  }

  return {
    sourceDir,
    skills: readSkillsFromDirectory(options.cwd, sourceDir)
  };
}

function readSkillsFromDirectory(rootDir: string, sourceDir: string): CodeDecaySkill[] {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSkill(rootDir, entry.name, join(sourceDir, entry.name, SKILL_FILENAME)))
    .filter((skill): skill is CodeDecaySkill => Boolean(skill))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readSkill(rootDir: string, id: string, path: string): CodeDecaySkill | undefined {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return undefined;
  }

  const content = readFileSync(path, "utf8");
  return {
    id,
    title: extractTitle(content) ?? titleFromId(id),
    path: normalizePath(relative(rootDir, path)),
    summary: extractSummary(content),
    content,
    untrusted: true
  };
}
