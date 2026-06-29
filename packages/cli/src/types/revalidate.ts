import type { RevalidationReport } from "@submuxhq/codedecay-core";
import type { MemoryImportCounts } from "@submuxhq/codedecay-memory";
import type { ConfigFormat } from "./common";

export interface RevalidateOptions {
  input: string;
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  falsePositiveIds: string[];
  acceptedRiskIds: string[];
  applyMemory: boolean;
}

export interface RevalidateCliReport extends RevalidationReport {
  memoryPreview: {
    apply: boolean;
    writtenPath?: string | undefined;
    suggested: {
      regressions: number;
    };
    added: MemoryImportCounts;
    merged: MemoryImportCounts;
  };
}
