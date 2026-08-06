import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const kitRoot = join(process.cwd(), "docs/evals/uat-kit");
const expectedTaskIds = [
  "UAT-HUMAN-1",
  "UAT-HUMAN-2",
  "UAT-HUMAN-3",
  "UAT-HUMAN-4",
  "UAT-HUMAN-5",
  "UAT-HUMAN-6",
  "UAT-HUMAN-7",
  "UAT-HUMAN-8"
];

describe("human UAT kit scaffolding (#692)", () => {
  it("keeps the versioned kit files required before human sessions", () => {
    for (const file of [
      "README.md",
      "participant-script.md",
      "observer-rubric.md",
      "consent-privacy.md",
      "facilitator-runbook.md",
      "outreach.md",
      "session-checklist.md",
      "fixtures.md",
      "tasks.json",
      "result.schema.json",
      "summary.template.md",
      "result-templates/ai-assisted-individual.template.json",
      "result-templates/experienced-engineer.template.json",
      "result-templates/team-devops.template.json"
    ]) {
      expect(existsSync(join(kitRoot, file))).toBe(true);
    }
    const schema = JSON.parse(readFileSync(join(kitRoot, "result.schema.json"), "utf8")) as {
      required: string[];
    };
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "schemaVersion",
        "participantRole",
        "tasks",
        "trustComprehension",
        "friction",
        "humanEvidence",
        "packageIdentity"
      ])
    );
    expect(readFileSync(join(kitRoot, "README.md"), "utf8")).toMatch(
      /cannot\s+finish\s+without\s+independent\s+human|cannot\s+close\s+without\s+independent\s+human/i
    );
  });

  it("publishes machine-readable UAT-HUMAN task IDs with humanEvidence false", () => {
    const tasks = JSON.parse(readFileSync(join(kitRoot, "tasks.json"), "utf8")) as {
      schemaVersion: number;
      humanEvidence: boolean;
      tasks: Array<{ id: string }>;
    };
    expect(tasks.schemaVersion).toBe(1);
    expect(tasks.humanEvidence).toBe(false);
    expect(tasks.tasks.map((task) => task.id)).toEqual(expectedTaskIds);
  });

  it("keeps blank templates non-evidential until a real session fills them", () => {
    const template = JSON.parse(
      readFileSync(join(kitRoot, "result-templates/ai-assisted-individual.template.json"), "utf8")
    ) as { humanEvidence: boolean; observerNotes: string };
    expect(template.humanEvidence).toBe(false);
    expect(template.observerNotes).toMatch(/TEMPLATE/i);
  });
});
