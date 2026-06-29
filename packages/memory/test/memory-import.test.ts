import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importCodeDecayMemory, loadCodeDecayMemory, writeCodeDecayMemory } from "../src/index";
import { createTempDir } from "./helpers/memory";

describe("CodeDecay memory import", () => {
  it("imports structured learnings and merges duplicate entries", () => {
    const result = importCodeDecayMemory(
      {
        version: 1,
        flows: [{ name: "Checkout", checks: ["existing smoke"], areas: ["api"] }],
        commands: [],
        invariants: [{ name: "Auth fails closed", description: "Existing invariant.", areas: ["auth"], severity: "medium" }],
        architecture: [],
        regressions: [{ title: "Anonymous admin", description: "Existing regression.", areas: ["auth"], severity: "medium" }]
      },
      {
        version: 1,
        flows: [{ name: "Checkout", checks: ["failed card retry"], areas: ["ui"] }],
        incidents: [{ title: "Anonymous admin", description: "Tokenless request became admin.", check: "request protected route without token", areas: ["auth"] }],
        pullRequests: [
          {
            title: "Billing rollout",
            description: "Merged rollout changed invoice flow.",
            checks: ["invoice retry path"],
            command: "pnpm test billing",
            areas: ["api", "ui"]
          }
        ]
      },
      "import.json"
    );

    expect(result.added).toMatchObject({
      flows: 1,
      commands: 1,
      architecture: 1
    });
    expect(result.merged).toMatchObject({
      flows: 1,
      regressions: 1
    });
    expect(result.memory.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Checkout", checks: ["existing smoke", "failed card retry"] }),
        expect.objectContaining({ name: "Billing rollout", checks: ["invoice retry path"] })
      ])
    );
    expect(result.memory.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Anonymous admin", check: "request protected route without token", severity: "high" }),
        expect.objectContaining({ title: "Billing rollout", check: "invoice retry path" })
      ])
    );
  });

  it("writes merged memory back to .codedecay/memory.json", () => {
    const root = createTempDir();
    const sourcePath = writeCodeDecayMemory(root, {
      version: 1,
      flows: [{ name: "Checkout", checks: ["existing smoke"], areas: ["api"] }],
      commands: [],
      invariants: [],
      architecture: [],
      regressions: []
    });
    const loaded = loadCodeDecayMemory(root);

    expect(sourcePath).toBe(join(root, ".codedecay/memory.json"));
    expect(loaded.memory.flows[0]?.name).toBe("Checkout");
  });
});
