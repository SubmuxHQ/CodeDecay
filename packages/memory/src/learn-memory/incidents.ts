import type { CodeDecayMemory } from "../types";
import { normalizeObject, optionalString } from "../schema";
import { inferCheckFromText, inferMemoryMatcher, looksLikeRegressionLearning, normalizeRiskValue } from "./matchers";
import type { MemoryLearningContext } from "./proposals";
import { learningSource, recordMemoryProposal } from "./proposals";

export function appendLearnedIncident(
  memory: CodeDecayMemory,
  value: unknown,
  sourcePath: string,
  context?: MemoryLearningContext | undefined
): void {
  const object = normalizeObject(value, sourcePath, "incidents[]");
  const markdown =
    optionalString(object.markdown, sourcePath, "incidents[].markdown") ??
    optionalString(object.content, sourcePath, "incidents[].content") ??
    optionalString(object.body, sourcePath, "incidents[].body") ??
    "";
  const title =
    optionalString(object.title, sourcePath, "incidents[].title") ??
    optionalString(object.name, sourcePath, "incidents[].name") ??
    titleFromMarkdown(markdown) ??
    "Incident learning";
  const description =
    optionalString(object.description, sourcePath, "incidents[].description") ??
    optionalString(object.summary, sourcePath, "incidents[].summary") ??
    firstParagraph(markdown) ??
    `Learned from incident or postmortem: ${title}.`;
  const text = [title, description, markdown].filter(Boolean).join("\n");
  const matcher = inferMemoryMatcher(object, text);
  const severity = normalizeRiskValue(object.severity ?? "high");
  const source = learningSource(
    markdown ? "incident-markdown" : "incident",
    optionalString(object.path, sourcePath, "incidents[].path") ?? sourcePath,
    object,
    title
  );

  const invariant = {
    name: title,
    description: `Learned from incident/postmortem: ${description}`,
    severity,
    ...matcher
  } as const;
  memory.invariants.push(invariant);
  recordMemoryProposal({
    context,
    section: "invariants",
    title,
    entry: invariant,
    source,
    confidence: severity,
    why: `Incident or postmortem "${title}" describes a durable rule the repo should keep checking.`
  });

  if (!looksLikeRegressionLearning(text)) {
    return;
  }

  const check = optionalString(object.check, sourcePath, "incidents[].check") ?? inferCheckFromText(title, text);
  const regression = {
    title,
    description,
    check,
    severity,
    ...matcher
  } as const;
  memory.regressions.push(regression);
  recordMemoryProposal({
    context,
    section: "regressions",
    title,
    entry: regression,
    source,
    confidence: severity,
    why: `Incident or postmortem "${title}" records a past production failure that should be rechecked.`
  });
}

function titleFromMarkdown(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("# ")) {
      continue;
    }

    const title = trimmed.slice(2).trim();
    if (title.length > 0) {
      return title;
    }
  }

  return undefined;
}

function firstParagraph(markdown: string): string | undefined {
  const stripped = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .join(" ");
  return stripped.length > 0 ? stripped.slice(0, 500) : undefined;
}
