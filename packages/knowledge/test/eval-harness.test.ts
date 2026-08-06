import { describe, expect, it } from "vitest";
import {
  defaultEfficacyScenarios,
  renderAgentEfficacyMarkdown,
  runAgentEfficacyEval
} from "../src/index";
import { detectAnswerLeak, detectLabelSwap, judgeTrial } from "../src/eval/integrity";
import { runFakeAgent } from "../src/eval/fake-agents";

describe("UAT agent efficacy eval (#683)", () => {
  it("UAT-EVAL-1: maintainer can run one paired scenario from a clean checkout", () => {
    const report = runAgentEfficacyEval({
      scenarios: defaultEfficacyScenarios().slice(0, 1),
      runId: "uat-eval-1",
      generatedAt: "2026-08-07T00:00:00.000Z"
    });
    expect(report.trials).toHaveLength(1);
    expect(report.trials[0]?.control.arm).toBe("control");
    expect(report.trials[0]?.treatment.arm).toBe("treatment");
    expect(report.mode).toBe("deterministic-fake-agent");
    expect(renderAgentEfficacyMarkdown(report)).toContain("Agent Efficacy Eval");
  });

  it("UAT-EVAL-2: cheating agent cannot pass by printing expected text or claiming checks ran", () => {
    const scenario = defaultEfficacyScenarios()[0]!;
    const cheating = runFakeAgent("cheating-fake", { arm: "treatment", scenario, codedecayHints: ["x"] });
    expect(judgeTrial(scenario, cheating)).toBe("contamination");
    const report = runAgentEfficacyEval({
      scenarios: [scenario],
      treatmentAgent: "cheating-fake",
      runId: "uat-eval-2"
    });
    expect(report.trials[0]?.treatmentVerdict).toBe("contamination");
    expect(report.summary.contaminationFailures).toBeGreaterThan(0);
  });

  it("UAT-EVAL-3: swapping labels or leaking expected answers is detected", () => {
    const scenario = defaultEfficacyScenarios()[0]!;
    expect(detectLabelSwap({ arm: "treatment" } as never, { arm: "control" } as never)).toMatch(/swapped/i);
    expect(detectAnswerLeak(scenario, `do the task EXPECTED ${scenario.oracleSecret}`)).toMatch(/leaked/i);
    const swapped = runAgentEfficacyEval({
      scenarios: [scenario],
      swapLabels: true,
      runId: "uat-eval-3-swap"
    });
    expect(swapped.integrity.labelSwapDetected).toBe(true);
    const leaked = runAgentEfficacyEval({
      scenarios: [scenario],
      leakOracleSecret: true,
      runId: "uat-eval-3-leak"
    });
    expect(leaked.integrity.answerLeakDetected).toBe(true);
  });

  it("UAT-EVAL-4: published-package treatment produces the same schema as local", () => {
    const local = runAgentEfficacyEval({
      scenarios: defaultEfficacyScenarios(),
      publishedPackageTreatment: false,
      runId: "uat-eval-4-local",
      generatedAt: "2026-08-07T00:00:00.000Z"
    });
    const published = runAgentEfficacyEval({
      scenarios: defaultEfficacyScenarios(),
      publishedPackageTreatment: true,
      runId: "uat-eval-4-published",
      generatedAt: "2026-08-07T00:00:00.000Z"
    });
    expect(local.schemaVersion).toBe(published.schemaVersion);
    expect(Object.keys(local).sort()).toEqual(Object.keys(published).sort());
    expect(published.publishedPackageTreatment).toBe(true);
  });

  it("UAT-EVAL-5: failed/timed-out/unavailable provider remains in report and denominator", () => {
    const report = runAgentEfficacyEval({
      scenarios: defaultEfficacyScenarios().slice(0, 1),
      treatmentAgent: "unavailable-fake",
      controlAgent: "timeout-fake",
      runId: "uat-eval-5"
    });
    expect(report.trials[0]?.controlVerdict).toBe("timeout");
    expect(report.trials[0]?.treatmentVerdict).toBe("provider-unavailable");
    expect(report.summary.providerFailuresCounted).toBe(2);
    expect(report.trials).toHaveLength(1);
  });

  it("honest treatment improves verified completion over control without flagging decoys", () => {
    const report = runAgentEfficacyEval({
      scenarios: defaultEfficacyScenarios(),
      runId: "honest-improve"
    });
    expect(report.summary.treatmentVerified).toBeGreaterThan(report.summary.controlVerified);
    expect(report.trials.every((trial) => trial.treatmentImproved)).toBe(true);
    expect(report.fullyVerified).toBe(false);
    expect(report.safety.hiddenProviderCalls).toBe(false);
  });
});
