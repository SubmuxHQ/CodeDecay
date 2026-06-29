import type { FileChange, Finding } from "@submuxhq/codedecay-core";
import { createSourceLogicBlocks, findCopiedImplementationBlock } from "../copied-implementation";
import { createSourceProfile, referencesAnyChangedSource } from "../source-profiles";
import { createWeakTestContext } from "./context";
import {
  addAssertionFindings,
  addCopiedImplementationFinding,
  addHappyPathOnlyFinding,
  addMockedSourceFindings,
  addUnrelatedTestFinding
} from "./findings";
import type { TestAuditResult } from "./types";

export function detectWeakTests(rootDir: string, changedTestFiles: FileChange[], changedSourceFiles: FileChange[]): TestAuditResult {
  const findings: Finding[] = [];
  const recommendedTests: string[] = [];

  if (changedTestFiles.length === 0) {
    return { findings, recommendedTests };
  }

  const sourceProfiles = changedSourceFiles.map((change) => createSourceProfile(change));
  const sourceBlocks = createSourceLogicBlocks(changedSourceFiles);

  for (const testChange of changedTestFiles) {
    const context = createWeakTestContext(rootDir, testChange);

    addAssertionFindings(testChange, context, findings, recommendedTests);
    addMockedSourceFindings(testChange, context, sourceProfiles, findings, recommendedTests);

    if (changedSourceFiles.length > 0 && !referencesAnyChangedSource(testChange, context.content, sourceProfiles)) {
      addUnrelatedTestFinding(testChange, changedSourceFiles, findings, recommendedTests);
    }

    const copiedBlock = findCopiedImplementationBlock(context.lines, sourceBlocks);
    if (copiedBlock) {
      addCopiedImplementationFinding(testChange, copiedBlock, findings, recommendedTests);
    }

    addHappyPathOnlyFinding(testChange, context, changedSourceFiles, findings, recommendedTests);
  }

  return {
    findings,
    recommendedTests
  };
}
