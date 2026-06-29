import type { FileStatus } from "@submuxhq/codedecay-core";

export interface GitDiffOptions {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
}

export interface GitWorktree {
  path: string;
  ref: string;
}

export interface GitWorktreeOptions {
  cwd: string;
  ref: string;
  prefix?: string | undefined;
}

export interface ParsedNameStatus {
  path: string;
  oldPath?: string | undefined;
  status: FileStatus;
}

export interface ParsedNumStat {
  additions: number;
  deletions: number;
}
