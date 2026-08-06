import type { ConfigFormat } from "./common";
import type { PolicyChangeClass } from "@submuxhq/codedecay-knowledge";

export interface PolicyOptions {
  cwd?: string | undefined;
  policyDirs: string[];
  orgPolicyDirs: string[];
  approvalDirs: string[];
  exceptionDirs: string[];
  changedPaths: string[];
  changeClass?: PolicyChangeClass | undefined;
  now?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}
