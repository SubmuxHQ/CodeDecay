import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  AcceptanceCriterionInput,
  RequirementContextInput,
  RequirementFlowKind,
  RequirementSource
} from "@submuxhq/codedecay-core";
import { parse } from "yaml";
import { z } from "zod";

const MAX_REQUIREMENTS_BYTES = 1024 * 1024;
const statementSchema = z.union([
  z.string(),
  z.object({ text: z.string().min(1), sourceIds: z.array(z.string()).optional() })
]);
const contextSchema = z.object({
  confidence: z.enum(["low", "medium", "high"]).optional(),
  task: statementSchema.optional(),
  currentBehavior: z.array(statementSchema).optional(),
  expectedBehavior: z.array(statementSchema).optional(),
  acceptanceCriteria: z.array(z.union([
    z.string(),
    z.object({
      id: z.string().optional(),
      text: z.string().min(1),
      requiredProof: z.array(z.string()).optional(),
      sourceIds: z.array(z.string()).optional()
    })
  ])).optional(),
  nonGoals: z.array(statementSchema).optional(),
  affectedFlows: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(["user", "api", "job", "data", "config"]),
    description: z.string().optional(),
    sourceIds: z.array(z.string()).optional()
  })).optional(),
  invariants: z.array(statementSchema).optional(),
  architectureConstraints: z.array(statementSchema).optional(),
  unresolvedQuestions: z.array(statementSchema).optional()
});

export interface LoadedRequirementArtifact {
  context: RequirementContextInput;
  source: RequirementSource;
}

export function loadRequirementArtifact(rootDir: string, artifactPath: string): LoadedRequirementArtifact {
  const resolvedPath = resolve(rootDir, artifactPath);
  const relativePath = relative(rootDir, resolvedPath);
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("--requirements must point to a file inside the repository.");
  }

  if (statSync(resolvedPath).size > MAX_REQUIREMENTS_BYTES) {
    throw new Error("--requirements artifact must be 1 MiB or smaller.");
  }

  let parsed: unknown;
  try {
    const content = readFileSync(resolvedPath, "utf8");
    parsed = relativePath.toLowerCase().endsWith(".md")
      ? parseMarkdownRequirements(content)
      : parse(content);
  } catch (error) {
    throw new Error(`Could not parse requirements artifact "${relativePath}": ${errorMessage(error)}`);
  }

  const result = contextSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid requirements artifact "${relativePath}": ${result.error.issues[0]?.message ?? "invalid shape"}.`);
  }

  return {
    context: {
      ...result.data,
      sources: [
        {
          id: "requirements-artifact",
          kind: "artifact",
          label: "Local requirements artifact",
          location: relativePath
        }
      ]
    },
    source: {
      id: "cli-task",
      kind: "task",
      label: "CLI --task input"
    }
  };
}

function parseMarkdownRequirements(content: string): RequirementContextInput {
  const sections = new Map<string, string[]>();
  let active = "";
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (heading?.[1]) {
      active = normalizeHeading(heading[1]);
      sections.set(active, sections.get(active) ?? []);
      continue;
    }
    if (active) {
      sections.get(active)?.push(line);
    }
  }

  if (sections.size === 0) {
    throw new Error("Markdown requirements must use headings such as Task and Acceptance Criteria.");
  }

  const result: RequirementContextInput = {
    currentBehavior: listText(sections.get("currentBehavior")),
    expectedBehavior: listText(sections.get("expectedBehavior")),
    acceptanceCriteria: acceptanceCriteria(sections.get("acceptanceCriteria")),
    nonGoals: listText(sections.get("nonGoals")),
    affectedFlows: affectedFlows(sections.get("affectedFlows")),
    invariants: listText(sections.get("invariants")),
    architectureConstraints: listText(sections.get("architectureConstraints")),
    unresolvedQuestions: listText(sections.get("unresolvedQuestions"))
  };
  const task = paragraphText(sections.get("task"));
  if (task) {
    result.task = task;
  }
  return result;
}

function normalizeHeading(value: string): string {
  const heading = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const names: Record<string, string> = {
    task: "task",
    "user story": "task",
    "current behavior": "currentBehavior",
    "expected behavior": "expectedBehavior",
    "acceptance criteria": "acceptanceCriteria",
    "non goals": "nonGoals",
    "affected flows": "affectedFlows",
    invariants: "invariants",
    "architecture constraints": "architectureConstraints",
    "unresolved questions": "unresolvedQuestions",
    uncertainty: "unresolvedQuestions"
  };
  return names[heading] ?? heading;
}

function paragraphText(lines: string[] | undefined): string {
  return (lines ?? []).map((line) => line.trim()).filter(Boolean).join(" ");
}

function listText(lines: string[] | undefined): string[] {
  return (lines ?? [])
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function acceptanceCriteria(lines: string[] | undefined): AcceptanceCriterionInput[] {
  const criteria: Array<Exclude<AcceptanceCriterionInput, string>> = [];
  for (const line of lines ?? []) {
    const item = line.match(/^(\s*)[-*]\s+(.+?)\s*$/);
    if (!item?.[2]) {
      continue;
    }
    const isNested = (item[1]?.length ?? 0) > 0;
    const proof = item[2].match(/^proof\s*:\s*(.+)$/i)?.[1]?.trim();
    if (isNested && proof && criteria.length > 0) {
      criteria.at(-1)?.requiredProof?.push(proof);
      continue;
    }
    if (isNested) {
      continue;
    }
    const identified = item[2].match(/^(AC[- ]?\d+)\s*[:.-]\s*(.+)$/i);
    criteria.push({
      id: identified?.[1]?.toUpperCase().replace(" ", "-") ?? `AC-${criteria.length + 1}`,
      text: identified?.[2]?.trim() ?? item[2].trim(),
      requiredProof: []
    });
  }
  return criteria;
}

function affectedFlows(lines: string[] | undefined): RequirementContextInput["affectedFlows"] {
  const validKinds = new Set<RequirementFlowKind>(["user", "api", "job", "data", "config"]);
  return listText(lines).map((entry) => {
    const match = entry.match(/^([a-z]+)\s*:\s*(.+)$/i);
    const candidate = match?.[1]?.toLowerCase() as RequirementFlowKind | undefined;
    return {
      kind: candidate && validKinds.has(candidate) ? candidate : "user",
      name: match?.[2]?.trim() ?? entry
    };
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
