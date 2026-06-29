import { describe, expect, it } from "vitest";
import { createOllamaProvider } from "../src/index";

describe("Ollama LLM provider", () => {
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

  it("normalizes slash-heavy local endpoints before making requests", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const provider = createOllamaProvider({
      model: "qwen2.5-coder",
      endpoint: `http://127.0.0.1:11434${"/".repeat(10_000)}`,
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
            return { response: "{\"suggestions\":[]}" };
          }
        };
      }
    });

    await provider.complete({ task: "Find edge cases" });

    expect(calls[0]?.url).toBe("http://127.0.0.1:11434/api/generate");
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
