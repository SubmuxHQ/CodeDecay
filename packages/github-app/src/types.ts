import type { CodeDecayReport } from "@submuxhq/codedecay-core";

export interface PullRequestRepository {
  full_name: string;
  name: string;
  owner: {
    login: string;
  };
}

export interface PullRequestRef {
  ref: string;
  sha: string;
  repo: PullRequestRepository | null;
}

export interface PullRequestPayload {
  action: string;
  repository: PullRequestRepository;
  pull_request: {
    number: number;
    html_url: string;
    title: string;
    draft?: boolean | undefined;
    base: PullRequestRef;
    head: PullRequestRef;
  };
}

export interface GitHubComment {
  id: number;
  body?: string | null | undefined;
}

export interface GitHubCheckRun {
  id: number;
}

export interface GitHubApiResponse<T> {
  data: T;
}

export interface GitHubClient {
  auth?: ((options: { type: "installation" }) => Promise<unknown>) | undefined;
  rest: {
    checks: {
      create: (options: Record<string, unknown>) => Promise<GitHubApiResponse<GitHubCheckRun>>;
      update: (options: Record<string, unknown>) => Promise<GitHubApiResponse<unknown>>;
    };
    issues: {
      listComments: (options: Record<string, unknown>) => Promise<GitHubApiResponse<GitHubComment[]>>;
      createComment: (options: Record<string, unknown>) => Promise<GitHubApiResponse<GitHubComment>>;
      updateComment: (options: Record<string, unknown>) => Promise<GitHubApiResponse<GitHubComment>>;
    };
  };
}

export interface GitHubAppContext {
  payload: PullRequestPayload;
  octokit: GitHubClient;
  log?: {
    info?: (input: unknown, message?: string) => void;
    warn?: (input: unknown, message?: string) => void;
    error?: (input: unknown, message?: string) => void;
  } | undefined;
}

export interface AnalyzePullRequestOptions {
  cwd: string;
  base: string;
  head: string;
}

export interface AnalyzePullRequestResult {
  report: CodeDecayReport;
  markdown: string;
}

export type CheckConclusion = "success" | "failure" | "neutral";

export interface HandlerResult {
  status: "completed" | "failed" | "ignored";
  report?: CodeDecayReport | undefined;
  message?: string | undefined;
}
