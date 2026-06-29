import { describe, expect, it, vi } from "vitest";
import { createHarnessRegistry, type CodeDecayHarness } from "../src/index";

describe("harness registry", () => {
  it("registers and lists harnesses deterministically", () => {
    const registry = createHarnessRegistry();
    registry.register(createHarness("stryker", ["mutation-testing"]));
    registry.register(createHarness("playwright", ["browser-flow"]));

    expect(registry.list().map((harness) => harness.name)).toEqual(["playwright", "stryker"]);
    expect(registry.require("stryker").capabilities).toEqual(["mutation-testing"]);
  });

  it("rejects duplicate harness names", () => {
    const registry = createHarnessRegistry([createHarness("process", ["execution"])]);

    expect(() => registry.register(createHarness("process", ["test-execution"]))).toThrow(
      "Harness already registered: process"
    );
  });

  it("finds harnesses by capability", () => {
    const registry = createHarnessRegistry([
      createHarness("process", ["execution", "test-execution"]),
      createHarness("playwright", ["browser-flow"]),
      createHarness("vitest", ["test-execution"])
    ]);

    expect(registry.findByCapability("test-execution").map((harness) => harness.name)).toEqual(["process", "vitest"]);
    expect(registry.findByCapability("api-fuzzing")).toEqual([]);
  });

  it("validates harness shape", () => {
    expect(() => createHarnessRegistry([createHarness("", ["execution"])])).toThrow("Harness name is required.");
    expect(() => createHarnessRegistry([createHarness("empty", [])])).toThrow(
      "Harness empty must declare at least one capability."
    );
    expect(() => createHarnessRegistry([createHarness("dupe", ["execution", "execution"])])).toThrow(
      "Harness dupe has duplicate capabilities: execution"
    );
  });
});

function createHarness(
  name: string,
  capabilities: CodeDecayHarness["capabilities"]
): CodeDecayHarness {
  return {
    name,
    capabilities,
    requiredConfig: [],
    plan: vi.fn(async () => ({
      id: `${name}-plan`,
      harnessName: name,
      summary: `${name} plan`,
      steps: [],
      requiresApproval: false
    })),
    run: vi.fn(async () => ({
      harnessName: name,
      status: "passed" as const,
      durationMs: 0,
      evidence: [],
      artifacts: []
    })),
    collectEvidence: vi.fn(async (result) => result.evidence),
    summarize: vi.fn(async (evidence) => ({
      harnessName: name,
      status: "passed" as const,
      summary: `${name} summary`,
      evidenceCount: evidence.length
    }))
  };
}
