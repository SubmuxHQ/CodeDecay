export interface GitHubTarget {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
}
