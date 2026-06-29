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
import { appendLearnedProductReport } from "./product-report";
import {
  collectLearnedProductReports,
  collectLearnedReports,
  isCodeDecayReportLike,
  isProductTargetReportLike
} from "./reports";

export function normalizeLearnedMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  const object = normalizeObject(value, sourcePath, "root");
  const learned = cloneMemory(DEFAULT_CODEDECAY_MEMORY);

  for (const failure of normalizeArray(object.ciFailures, sourcePath, "ciFailures")) {
    appendLearnedCiFailure(learned, failure, sourcePath);
  }

  for (const pullRequest of normalizeArray(object.pullRequests, sourcePath, "pullRequests")) {
    appendLearnedPullRequest(learned, pullRequest, sourcePath);
  }

  for (const report of collectLearnedReports(object)) {
    appendLearnedCodeDecayReport(learned, report);
  }

  if (isCodeDecayReportLike(object)) {
    appendLearnedCodeDecayReport(learned, object);
  }

  for (const report of collectLearnedProductReports(object)) {
    appendLearnedProductReport(learned, report);
  }

  if (isProductTargetReportLike(object)) {
    appendLearnedProductReport(learned, object);
  }

  return {
    version: 1,
    flows: sortFlows(learned.flows),
    commands: sortCommands(learned.commands),
    invariants: sortInvariants(learned.invariants),
    architecture: sortArchitecture(learned.architecture),
    regressions: sortRegressions(learned.regressions)
  };
}
