import { describe, expect, it } from "vitest";
import { DEFAULT_CODEDECAY_MEMORY } from "../src/index";

describe("memory public types and defaults", () => {
  it("exports the default local memory shape from the package entrypoint", () => {
    expect(DEFAULT_CODEDECAY_MEMORY).toEqual({
      version: 1,
      flows: [],
      commands: [],
      invariants: [],
      architecture: [],
      regressions: []
    });
  });
});
