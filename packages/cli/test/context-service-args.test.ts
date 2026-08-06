import { describe, expect, it } from "vitest";
import { parseContextArgs } from "../src/parsers/context";

describe("parseContextArgs service subcommands", () => {
  it("parses serve/health/query with session options", () => {
    expect(parseContextArgs(["serve", "--format", "json"])).toMatchObject({
      serviceAction: "serve",
      format: "json"
    });
    expect(
      parseContextArgs(["query", "--session-id", "agent-a", "--task", "fix payouts", "--wait-budget-ms", "100"])
    ).toMatchObject({
      serviceAction: "query",
      sessionId: "agent-a",
      task: "fix payouts",
      waitBudgetMs: 100
    });
    expect(parseContextArgs(["health"])).toMatchObject({ serviceAction: "health", format: "markdown" });
  });
});
