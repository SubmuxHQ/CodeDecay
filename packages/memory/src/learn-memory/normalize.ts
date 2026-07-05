import { normalizeArray, normalizeObject, cloneMemory } from "../schema";
import { DEFAULT_CODEDECAY_MEMORY } from "../types";
import type { CodeDecayMemory } from "../types";
import {
  sortArchitecture,
  sortCommands,
  sortFlows,
  sortInvariants,
  sortRegressions
} from "../import-memory";
import { appendLearnedCiFailure, appendLearnedPullRequest } from "./ci-pr";
import { appendLearnedCodeDecayReport } from "./codedecay-report";
import { appendLearnedIncident } from "./incidents";
import type { MemoryLearningContext } from "./proposals";
import { appendLearnedProductReport } from "./product-report";
import {
  collectLearnedProductReports,
  collectLearnedReports,
  isCodeDecayReportLike,
  isProductTargetReportLike
} from "./reports";
import type { MemoryLearningProposal } from "../types";

export function normalizeLearnedMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  return normalizeLearnedMemoryWithProposals(value, sourcePath).memory;
}

export function normalizeLearnedMemoryWithProposals(
  value: unknown,
  sourcePath: string,
  context?: MemoryLearningContext | undefined
): { memory: CodeDecayMemory; proposals: MemoryLearningProposal[] } {
  const object = normalizeObject(value, sourcePath, "root");
  const learned = cloneMemory(DEFAULT_CODEDECAY_MEMORY);

  for (const failure of normalizeArray(object.ciFailures, sourcePath, "ciFailures")) {
    appendLearnedCiFailure(learned, failure, sourcePath, context);
  }

  for (const pullRequest of normalizeArray(object.pullRequests, sourcePath, "pullRequests")) {
    appendLearnedPullRequest(learned, pullRequest, sourcePath, context);
  }

  for (const incident of [
    ...normalizeArray(object.incidents, sourcePath, "incidents"),
    ...normalizeArray(object.incidentMarkdowns, sourcePath, "incidentMarkdowns")
  ]) {
    appendLearnedIncident(learned, incident, sourcePath, context);
  }

  for (const report of collectLearnedReports(object)) {
    appendLearnedCodeDecayReport(learned, report, sourcePath, context);
  }

  if (isCodeDecayReportLike(object)) {
    appendLearnedCodeDecayReport(learned, object, sourcePath, context);
  }

  for (const report of collectLearnedProductReports(object)) {
    appendLearnedProductReport(learned, report, sourcePath, context);
  }

  if (isProductTargetReportLike(object)) {
    appendLearnedProductReport(learned, object, sourcePath, context);
  }

  const memory: CodeDecayMemory = {
    version: 1,
    flows: sortFlows(learned.flows),
    commands: sortCommands(learned.commands),
    invariants: sortInvariants(learned.invariants),
    architecture: sortArchitecture(learned.architecture),
    regressions: sortRegressions(learned.regressions)
  };

  return {
    memory,
    proposals: context?.proposals ?? []
  };
}
