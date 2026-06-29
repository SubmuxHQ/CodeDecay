import { describe, expect, it } from "vitest";
import { createDisabledLlmProvider, createLlmProvider } from "../src/index";

describe("disabled LLM provider", () => {
  it("uses a disabled provider by default", async () => {
    const provider = createLlmProvider({
      provider: "disabled",
      timeoutMs: 30_000
    });

    const completion = await provider.complete({
      task: "Find overlooked regressions"
    });

    expect(provider.id).toBe("disabled");
    expect(completion).toEqual({
      providerId: "disabled",
      text: "",
      suggestions: [],
      untrusted: true
    });
  });

  it("does not require model calls for the disabled provider", async () => {
    const provider = createDisabledLlmProvider();

    await expect(provider.complete({ task: "No model call" })).resolves.toMatchObject({
      providerId: "disabled",
      suggestions: []
    });
  });
});
