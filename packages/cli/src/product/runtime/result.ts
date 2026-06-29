import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import type {
  ManagedProductProcess,
  ProductExplorationResult,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult,
  ProductHealthResult,
  ProductTargetResult,
  ProductTargetStatus
} from "../../types";
import { elapsed } from "./timing";

export function createProductTargetResult(
  target: CodeDecayProductTarget,
  status: ProductTargetStatus,
  startedAt: number,
  notes: string[],
  setup: CommandExecutionResult | undefined,
  start: ManagedProductProcess | undefined,
  health: ProductHealthResult | undefined,
  exploration: ProductExplorationResult | undefined,
  generatedTests: ProductGeneratedTestsResult | undefined,
  generatedTestRun: ProductGeneratedTestRunResult | undefined,
  generatedApiTests: ProductGeneratedTestsResult | undefined,
  generatedApiTestRun: ProductGeneratedTestRunResult | undefined,
  teardown: CommandExecutionResult | undefined
): ProductTargetResult {
  const result: ProductTargetResult = {
    id: target.id,
    status,
    readiness: target.readiness,
    baseUrl: target.readiness.effectiveBaseUrl ?? target.baseUrl,
    healthCheck: target.healthCheck,
    timeoutMs: target.timeoutMs,
    durationMs: elapsed(startedAt),
    notes
  };

  if (setup) {
    result.setup = setup;
  }

  if (start) {
    const { child: _child, ...serializableStart } = start;
    result.start = serializableStart;
  }

  if (health) {
    result.health = health;
  }

  if (exploration) {
    result.exploration = exploration;
  }

  if (generatedTests) {
    result.generatedTests = generatedTests;
  }

  if (generatedTestRun) {
    result.generatedTestRun = generatedTestRun;
  }

  if (generatedApiTests) {
    result.generatedApiTests = generatedApiTests;
  }

  if (generatedApiTestRun) {
    result.generatedApiTestRun = generatedApiTestRun;
  }

  if (teardown) {
    result.teardown = teardown;
  }

  return result;
}
