import { describe, expect, it } from "vitest";
import { JWT_AUTH_KNOWLEDGE_PACK, matchKnowledgePacks } from "../src/index";

describe("jwt-auth knowledge pack", () => {
  it("keeps edge cases structured, cited, and action-oriented", () => {
    expect(JWT_AUTH_KNOWLEDGE_PACK).toMatchObject({
      area: "jwt-auth",
      title: "JWT authentication edge cases",
      cwe: expect.arrayContaining(["CWE-345", "CWE-347"])
    });
    expect(JWT_AUTH_KNOWLEDGE_PACK.edgeCases.length).toBeGreaterThanOrEqual(6);

    for (const edgeCase of JWT_AUTH_KNOWLEDGE_PACK.edgeCases) {
      expect(edgeCase.id).toMatch(/^jwt-/);
      expect(edgeCase.title).toBeTruthy();
      expect(edgeCase.symptom).toBeTruthy();
      expect(edgeCase.rootCause).toBeTruthy();
      expect(edgeCase.detectionHint).toBeTruthy();
      expect(edgeCase.fixHint).toBeTruthy();
      expect(edgeCase.sources.length).toBeGreaterThan(0);
      expect(edgeCase.sources.every((source) => source.startsWith("https://"))).toBe(true);
    }
  });

  it("matches auth and jwt-shaped changes", () => {
    expect(
      matchKnowledgePacks({
        impactedAreas: ["auth"],
        changedPaths: ["src/auth/session.ts"]
      }).map((pack) => pack.area)
    ).toContain("jwt-auth");

    expect(
      matchKnowledgePacks({
        impactedAreas: ["source"],
        changedPaths: ["src/lib/jwks-client.ts"]
      }).map((pack) => pack.area)
    ).toContain("jwt-auth");
  });
});
