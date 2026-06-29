import { describe, expect, it } from "vitest";
import { createLiteLlmProvider } from "../src/index";

describe("LiteLLM provider", () => {
  it("calls LiteLLM/OpenAI-compatible endpoints with chat completions and untrusted suggestions", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    const provider = createLiteLlmProvider({
      model: "gpt-4.1-mini",
      endpoint: "http://127.0.0.1:4000/v1/",
      apiKeyEnv: "LITELLM_API_KEY",
      env: {
        LITELLM_API_KEY: "test-key"
      },
      fetch: async (url, init) => {
        calls.push({
          url,
          headers: init.headers,
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
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          title: "Missing integration proof",
                          detail: "Run the real route with a malformed payload.",
                          severity: "high",
                          evidence: ["src/routes/users.ts"]
                        }
                      ]
                    })
                  }
                }
              ]
            };
          }
        };
      }
    });

    const completion = await provider.complete({
      task: "Find test gaps",
      context: {
        changedFiles: ["src/routes/users.ts"]
      }
    });

    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:4000/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-key"
      },
      body: {
        model: "gpt-4.1-mini",
        temperature: 0,
        stream: false
      }
    });
    expect(completion).toMatchObject({
      providerId: "litellm",
      model: "gpt-4.1-mini",
      untrusted: true,
      suggestions: [
        {
          title: "Missing integration proof",
          detail: "Run the real route with a malformed payload.",
          severity: "high",
          evidence: ["src/routes/users.ts"]
        }
      ]
    });
  });

  it("fails clearly when a configured LiteLLM API key env var is missing", async () => {
    const provider = createLiteLlmProvider({
      model: "gpt-4.1-mini",
      endpoint: "http://127.0.0.1:4000/v1",
      apiKeyEnv: "MISSING_LITELLM_API_KEY",
      env: {},
      fetch: async () => {
        throw new Error("fetch should not be called");
      }
    });

    await expect(provider.complete({ task: "Find edge cases" })).rejects.toThrow(
      "LiteLLM provider could not read API key from environment variable MISSING_LITELLM_API_KEY."
    );
  });

  it("fails clearly when LiteLLM returns an error", async () => {
    const provider = createLiteLlmProvider({
      model: "gpt-4.1-mini",
      endpoint: "http://127.0.0.1:4000/v1",
      fetch: async () => ({
        ok: false,
        status: 401,
        async text() {
          return "missing key";
        },
        async json() {
          return {};
        }
      })
    });

    await expect(provider.complete({ task: "Find edge cases" })).rejects.toThrow(
      "LiteLLM request failed with 401: missing key"
    );
  });
});
