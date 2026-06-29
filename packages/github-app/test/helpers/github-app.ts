import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { vi } from "vitest";
import type { GitHubAppContext, GitHubClient, PullRequestPayload } from "../../src/index.js";

export function createContext(overrides: Partial<PullRequestPayload> = {}): GitHubAppContext {
  return {
    payload: {
      action: "opened",
      repository: {
        full_name: "SubmuxHQ/CodeDecay",
        name: "CodeDecay",
        owner: {
          login: "SubmuxHQ"
        }
      },
      pull_request: {
        number: 12,
        html_url: "https://github.com/SubmuxHQ/CodeDecay/pull/12",
        title: "Example PR",
        base: {
          ref: "main",
          sha: "base-sha",
          repo: {
            full_name: "SubmuxHQ/CodeDecay",
            name: "CodeDecay",
            owner: {
              login: "SubmuxHQ"
            }
          }
        },
        head: {
          ref: "feature/example",
          sha: "head-sha",
          repo: {
            full_name: "SubmuxHQ/CodeDecay",
            name: "CodeDecay",
            owner: {
              login: "SubmuxHQ"
            }
          }
        }
      },
      ...overrides
    },
    octokit: createOctokit()
  };
}

export function createOctokit(options: { comments?: Array<{ id: number; body: string }> } = {}): GitHubClient {
  return {
    auth: vi.fn().mockResolvedValue({ token: "token-123" }),
    rest: {
      checks: {
        create: vi.fn().mockResolvedValue({ data: { id: 456 } }),
        update: vi.fn().mockResolvedValue({ data: {} })
      },
      issues: {
        listComments: vi.fn().mockResolvedValue({ data: options.comments ?? [] }),
        createComment: vi.fn().mockResolvedValue({ data: { id: 123 } }),
        updateComment: vi.fn().mockResolvedValue({ data: { id: 123 } })
      }
    }
  };
}

export function createReport(riskLevel: "low" | "medium" | "high"): CodeDecayReport {
  return {
    tool: "CodeDecay",
    version: "0.1.5",
    generatedAt: "2026-06-24T00:00:00.000Z",
    base: "base-sha",
    head: "head-sha",
    summary: {
      mergeRiskScore: riskLevel === "high" ? 80 : riskLevel === "medium" ? 50 : 10,
      decayScore: 10,
      securityScore: 0,
      riskLevel,
      findingCounts: {
        low: 0,
        medium: riskLevel === "medium" ? 1 : 0,
        high: riskLevel === "high" ? 1 : 0
      }
    },
    changedFiles: [],
    impactedAreas: [],
    findings: [],
    recommendedTests: []
  };
}
