import { describe, expect, it, vi } from "vitest";
import { COMMENT_MARKER, handlePullRequestEvent, upsertPullRequestComment } from "../src/index.js";
import { createContext, createOctokit, createReport } from "./helpers/github-app";

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
