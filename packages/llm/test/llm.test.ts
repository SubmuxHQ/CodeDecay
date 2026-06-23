import { describe, expect, it } from "vitest";
import { createDisabledLlmProvider, createLlmProvider, createOllamaProvider } from "../src/index";

describe("llm providers", () => {
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

  it("creates an Ollama provider from config", () => {
    const provider = createLlmProvider({
      provider: "ollama",
      model: "qwen2.5-coder",
      endpoint: "http://127.0.0.1:11434/",
      timeoutMs: 10_000
    });

    expect(provider.id).toBe("ollama");
  });

  it("parses structured suggestions from Ollama responses", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const provider = createOllamaProvider({
      model: "qwen2.5-coder",
      endpoint: "http://127.0.0.1:11434/",
      fetch: async (url, init) => {
        calls.push({
          url,
          body: JSON.parse(init.body)
        });

        return {
          ok: true,
          status: 200,
          async text() {
            return "";
          },
          async json() {
            return {
              response: JSON.stringify({
                suggestions: [
                  {
                    title: "Missing malformed payload check",
                    detail: "Exercise the real API path with malformed IMU input.",
                    severity: "medium",
                    evidence: ["src/imu/api.ts"]
                  }
                ]
              })
            };
          }
        };
      }
    });

    const completion = await provider.complete({
      task: "Find edge cases",
      context: {
        changedFiles: ["src/imu/api.ts"]
      }
    });

    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:11434/api/generate",
      body: {
        model: "qwen2.5-coder",
        stream: false
      }
    });
    expect(completion).toMatchObject({
      providerId: "ollama",
      model: "qwen2.5-coder",
      untrusted: true,
      suggestions: [
        {
          title: "Missing malformed payload check",
          detail: "Exercise the real API path with malformed IMU input.",
          severity: "medium",
          evidence: ["src/imu/api.ts"]
        }
      ]
    });
  });

  it("fails clearly when Ollama returns an error", async () => {
    const provider = createOllamaProvider({
      model: "qwen2.5-coder",
      fetch: async () => ({
        ok: false,
        status: 500,
        async text() {
          return "model unavailable";
        },
        async json() {
          return {};
        }
      })
    });

    await expect(provider.complete({ task: "Find edge cases" })).rejects.toThrow(
      "Ollama request failed with 500: model unavailable"
    );
  });
});
