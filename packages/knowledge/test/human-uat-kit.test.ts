import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const kitRoot = join(process.cwd(), "docs/evals/uat-kit");

describe("human UAT kit scaffolding (#692)", () => {
  it("keeps the versioned kit files required before human sessions", () => {
    for (const file of [
      "README.md",
      "participant-script.md",
      "observer-rubric.md",
      "consent-privacy.md",
      "result.schema.json",
      "summary.template.md"
    ]) {
      expect(existsSync(join(kitRoot, file))).toBe(true);
    }
    const schema = JSON.parse(readFileSync(join(kitRoot, "result.schema.json"), "utf8")) as {
      required: string[];
    };
    expect(schema.required).toEqual(
      expect.arrayContaining(["schemaVersion", "participantRole", "tasks", "trustComprehension"])
    );
    expect(readFileSync(join(kitRoot, "README.md"), "utf8")).toMatch(/cannot close without independent human/i);
  });
});
