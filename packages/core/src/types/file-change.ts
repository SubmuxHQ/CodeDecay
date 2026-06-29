export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface ChangedLine {
  line: number;
  content: string;
}

export interface FileChange {
  path: string;
  oldPath?: string | undefined;
  status: FileStatus;
  additions: number;
  deletions: number;
  addedLines: ChangedLine[];
}
