import type { CodeDecayMemory } from "../types";
import { normalizeObject, optionalString, optionalStringArray, requiredString } from "../schema";
import { inferCheckFromText, inferMemoryMatcher, looksLikeRegressionLearning } from "./matchers";
import type { MemoryLearningContext } from "./proposals";
import { learningSource, recordMemoryProposal } from "./proposals";

export function appendLearnedCiFailure(
  memory: CodeDecayMemory,
  value: unknown,
  sourcePath: string,
  context?: MemoryLearningContext | undefined
): void {
  const object = normalizeObject(value, sourcePath, "ciFailures[]");
  const title =
    optionalString(object.title, sourcePath, "ciFailures[].title") ??
    optionalString(object.name, sourcePath, "ciFailures[].name") ??
    optionalString(object.job, sourcePath, "ciFailures[].job") ??
    optionalString(object.workflow, sourcePath, "ciFailures[].workflow") ??
    "CI failure";
  const description =
    optionalString(object.description, sourcePath, "ciFailures[].description") ??
    optionalString(object.summary, sourcePath, "ciFailures[].summary") ??
    optionalString(object.message, sourcePath, "ciFailures[].message") ??
    `Learned from CI failure: ${title}.`;
  const command =
    optionalString(object.command, sourcePath, "ciFailures[].command") ??
    optionalString(object.testCommand, sourcePath, "ciFailures[].testCommand");
  const matcher = inferMemoryMatcher(object, `${title}\n${description}`);
  const check = optionalString(object.check, sourcePath, "ciFailures[].check") ?? command ?? `Re-run failing CI path: ${title}`;
  const source = learningSource("ci-failure", sourcePath, object, title);

  const regression = {
    title,
    description,
    check,
    severity: "high",
    ...matcher
  } as const;
  memory.regressions.push(regression);
  recordMemoryProposal({
    context,
    section: "regressions",
    title,
    entry: regression,
    source,
    confidence: "high",
    why: `CI failure "${title}" is evidence of a path that should be rechecked before similar changes merge.`
  });

  if (command) {
    const commandEntry = {
      name: `${title} check`,
      command,
      description,
      ...matcher
    };
    memory.commands.push(commandEntry);
    recordMemoryProposal({
      context,
      section: "commands",
      title: commandEntry.name,
      entry: commandEntry,
      source,
      confidence: "high",
      why: `CI failure "${title}" included a concrete command that can prove the learned path.`
    });
  }
}

export function appendLearnedPullRequest(
  memory: CodeDecayMemory,
  value: unknown,
  sourcePath: string,
  context?: MemoryLearningContext | undefined
): void {
  const object = normalizeObject(value, sourcePath, "pullRequests[]");
  const title = requiredString(object.title, sourcePath, "pullRequests[].title");
  const body =
    optionalString(object.body, sourcePath, "pullRequests[].body") ??
    optionalString(object.description, sourcePath, "pullRequests[].description") ??
    optionalString(object.summary, sourcePath, "pullRequests[].summary") ??
    "";
  const commits = optionalStringArray(object.commits, sourcePath, "pullRequests[].commits") ?? [];
  const checks = optionalStringArray(object.checks, sourcePath, "pullRequests[].checks") ?? [];
  const text = [title, body, ...commits].filter(Boolean).join("\n");
  const matcher = inferMemoryMatcher(object, text);
  const description = body || `Learned from merged PR: ${title}.`;
  const generatedCheck = checks[0] ?? inferCheckFromText(title, text);
  const source = learningSource("pull-request", sourcePath, object, title);

  const architecture = {
    title,
    note: description,
    ...matcher
  };
  memory.architecture.push(architecture);
  recordMemoryProposal({
    context,
    section: "architecture",
    title,
    entry: architecture,
    source,
    confidence: looksLikeRegressionLearning(text) ? "medium" : "low",
    why: `Merged PR "${title}" records repository behavior or architecture context that future agents should see.`
  });

  if (checks.length > 0) {
    const flow = {
      name: title,
      description,
      checks,
      ...matcher
    };
    memory.flows.push(flow);
    recordMemoryProposal({
      context,
      section: "flows",
      title,
      entry: flow,
      source,
      confidence: "medium",
      why: `Merged PR "${title}" included explicit checks that can become reviewable flow proof.`
    });
  }

  if (looksLikeRegressionLearning(text)) {
    const regression = {
      title,
      description,
      check: generatedCheck,
      severity: "medium",
      ...matcher
    } as const;
    memory.regressions.push(regression);
    recordMemoryProposal({
      context,
      section: "regressions",
      title,
      entry: regression,
      source,
      confidence: "medium",
      why: `Merged PR "${title}" looks like it fixed a regression, so similar areas should be rechecked.`
    });
  }
}
