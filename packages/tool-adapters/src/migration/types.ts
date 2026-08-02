import type { MigrationTargetKind } from "@submuxhq/codedecay-knowledge";

export interface PrismaMigrationAdapterOptions {
  provider: "prisma";
  fromSchema: string;
  toSchema: string;
  targetKind: MigrationTargetKind;
  approved: boolean;
  timeoutMs: number;
  cleanupPlan: string;
  secretEnvNames: string[];
}

export interface MigrationAdapterPlan {
  provider: "prisma";
  mode: "schema-diff";
  command: string;
  targetKind: MigrationTargetKind;
  requiresApproval: true;
  executable: boolean;
  timeoutMs: number;
  cleanupPlan: string;
  secretEnvNames: string[];
  blockers: string[];
  safety: {
    readOnly: true;
    databaseConnected: false;
    migrationApplied: false;
  };
}
