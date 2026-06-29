import type { CodeDecayMemory } from "../types";
import { normalizeObject, optionalString, optionalStringArray, requiredString } from "../schema";
import { inferCheckFromText, inferMemoryMatcher, looksLikeRegressionLearning } from "./matchers";

export function appendLearnedCiFailure(memory: CodeDecayMemory, value: unknown, sourcePath: string): void {
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

  memory.regressions.push({
    title,
    description,
    check,
    severity: "high",
    ...matcher
  });

  if (command) {
    memory.commands.push({
      name: `${title} check`,
      command,
      description,
      ...matcher
    });
  }
}

export function appendLearnedPullRequest(memory: CodeDecayMemory, value: unknown, sourcePath: string): void {
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

  memory.architecture.push({
    title,
    note: description,
    ...matcher
  });

  if (checks.length > 0) {
    memory.flows.push({
      name: title,
      description,
      checks,
      ...matcher
    });
  }

  if (looksLikeRegressionLearning(text)) {
    memory.regressions.push({
      title,
      description,
      check: generatedCheck,
      severity: "medium",
      ...matcher
    });
  }
}
