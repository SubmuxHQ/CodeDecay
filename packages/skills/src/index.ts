import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface LoadCodeDecaySkillsOptions {
  cwd: string;
}

export interface LoadedCodeDecaySkills {
  sourceDir?: string | undefined;
  skills: CodeDecaySkill[];
}

export interface CodeDecaySkill {
  id: string;
  title: string;
  path: string;
  summary: string;
  content: string;
  untrusted: true;
}

const DEFAULT_SKILLS_DIR = join(".agents", "skills");
const SKILL_FILENAME = "SKILL.md";

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

function extractTitle(content: string): string | undefined {
  const titleLine = content.split(/\r?\n/).find((line) => /^#\s+\S/.test(line));
  return titleLine?.replace(/^#\s+/, "").trim();
}

function extractSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  const summaryLines: string[] = [];
  let passedTitle = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!passedTitle && /^#\s+\S/.test(trimmed)) {
      passedTitle = true;
      continue;
    }

    if (!passedTitle || trimmed.length === 0) {
      if (summaryLines.length > 0) {
        break;
      }
      continue;
    }

    if (trimmed.startsWith("#")) {
      break;
    }

    summaryLines.push(trimmed);
  }

  return summaryLines.join(" ").trim() || "No summary provided.";
}

function titleFromId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
