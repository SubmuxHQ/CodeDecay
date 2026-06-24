import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { describe, expect, it, vi } from "vitest";
import { COMMENT_MARKER, handlePullRequestEvent, upsertPullRequestComment } from "../src/index.js";
import type { GitHubAppContext, GitHubClient, PullRequestPayload } from "../src/index.js";

describe("CodeDecay GitHub App", () => {
  it("ignores unsupported pull request actions", async () => {
    const context = createContext({ action: "closed" });
    const createCheck = vi.fn();

    const result = await handlePullRequestEvent(context, { createCheck });

    expect(result.status).toBe("ignored");
    expect(createCheck).not.toHaveBeenCalled();
  });

  it("runs analysis, updates the check run, posts one report comment, and cleans up", async () => {
    const report = createReport("medium");
    const context = createContext();
    const cleanup = vi.fn();

    const result = await handlePullRequestEvent(context, {
      getToken: vi.fn().mockResolvedValue("token-123"),
      checkout: vi.fn().mockReturnValue("/tmp/codedecay-checkout"),
      cleanup,
      analyze: vi.fn().mockReturnValue({
        report,
        markdown: "## CodeDecay Report\n\n**Overall risk:** Medium\n"
      })
    });

    expect(result.status).toBe("completed");
    expect(context.octokit.rest.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "SubmuxHQ",
        repo: "CodeDecay",
        head_sha: "head-sha",
        status: "in_progress"
      })
    );
    expect(context.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "SubmuxHQ",
        repo: "CodeDecay",
        issue_number: 12,
        body: expect.stringContaining(COMMENT_MARKER)
      })
    );
    expect(context.octokit.rest.checks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        check_run_id: 456,
        conclusion: "success",
        status: "completed"
      })
    );
    expect(cleanup).toHaveBeenCalledWith("/tmp/codedecay-checkout");
  });

  it("updates an existing marker comment instead of creating duplicates", async () => {
    const octokit = createOctokit({
      comments: [{ id: 99, body: `${COMMENT_MARKER}\nOld report` }]
    });

    await upsertPullRequestComment({
      octokit,
      target: {
        owner: "SubmuxHQ",
        repo: "CodeDecay",
        pullNumber: 12,
        headSha: "head-sha"
      },
      markdown: "## New report"
    });

    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 99,
        body: expect.stringContaining("## New report")
      })
    );
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("marks the check run as failed when analysis fails", async () => {
    const context = createContext();
    const cleanup = vi.fn();

    const result = await handlePullRequestEvent(context, {
      getToken: vi.fn().mockResolvedValue("secret-token"),
      checkout: vi.fn().mockReturnValue("/tmp/codedecay-checkout"),
      cleanup,
      analyze: vi.fn(() => {
        throw new Error("GitHub App checkout failed: https://x-access-token:secret-token@github.com/SubmuxHQ/CodeDecay.git");
      })
    });

    expect(result.status).toBe("failed");
    expect(result.message).not.toContain("secret-token");
    expect(context.octokit.rest.checks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: "failure",
        output: expect.objectContaining({
          title: "CodeDecay analysis failed",
          summary: expect.not.stringContaining("secret-token")
        })
      })
    );
    expect(cleanup).toHaveBeenCalledWith("/tmp/codedecay-checkout");
  });
});

function createContext(overrides: Partial<PullRequestPayload> = {}): GitHubAppContext {
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

function createOctokit(options: { comments?: Array<{ id: number; body: string }> } = {}): GitHubClient {
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

function createReport(riskLevel: "low" | "medium" | "high"): CodeDecayReport {
  return {
    tool: "CodeDecay",
    version: "0.1.4",
    generatedAt: "2026-06-24T00:00:00.000Z",
    base: "base-sha",
    head: "head-sha",
    summary: {
      mergeRiskScore: riskLevel === "high" ? 80 : riskLevel === "medium" ? 50 : 10,
      decayScore: 10,
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
