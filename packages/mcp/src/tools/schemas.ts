import { z } from "zod";
import { AGENT_PROFILE_IDS } from "@submuxhq/codedecay-agent";

const cwdSchema = z.string().optional().describe("Repository working directory. Defaults to the server cwd.");
const baseSchema = z.string().optional().describe("Base git ref or SHA.");
const headSchema = z.string().optional().describe("Head git ref or SHA.");
const formatSchema = z.enum(["markdown", "json"]).optional().describe("Response format.");
const targetSchema = z.string().optional().describe("Optional productTesting target id.");
const confirmExecutionSchema = z.boolean().optional().describe("Must be true before CodeDecay runs configured local commands.");
const riskLevelSchema = z.enum(["low", "medium", "high"]);
const taskSourceSchema = z.enum([
  "finding",
  "weak-test",
  "edge-case",
  "configured-check",
  "tool-adapter",
  "memory",
  "pattern",
  "product-failure"
]);
const impactedAreaKindSchema = z.enum(["api", "ui", "database", "auth", "config", "test", "source", "docs"]);

export const analyzePrToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema,
  format: formatSchema
};

export const gitContextToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema
};

export const agentTaskBundleToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema,
  format: formatSchema,
  profile: z.enum(AGENT_PROFILE_IDS).optional().describe("User-owned agent handoff profile.")
};

export const scopeCheckToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema,
  task: z.string().optional().describe("Optional agent task or scope label."),
  fence: z.string().optional().describe("Design contract scope fence id. Defaults to activeScopeFence."),
  files: z.array(z.string()).optional().describe("Inline allowed file/path globs for this task."),
  areas: z.array(impactedAreaKindSchema).optional().describe("Inline allowed impacted-area kinds for this task.")
};

export const designContractCheckToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema
};

export const fixTasksToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema,
  source: taskSourceSchema.optional().describe("Filter fix tasks by deterministic source."),
  priority: riskLevelSchema.optional().describe("Filter fix tasks by priority."),
  file: z.string().optional().describe("Filter fix tasks by file path.")
};

export const executeConfiguredChecksToolSchema = {
  cwd: cwdSchema,
  format: formatSchema,
  confirmExecution: confirmExecutionSchema
};

export const productToolSchema = {
  cwd: cwdSchema,
  target: targetSchema,
  format: formatSchema
};

export const productRunToolSchema = {
  cwd: cwdSchema,
  target: targetSchema,
  format: formatSchema,
  confirmExecution: z.boolean().optional().describe("Must be true before CodeDecay runs product verification."),
  explore: z.boolean().optional().describe("Run product flow exploration."),
  generateTests: z.boolean().optional().describe("Generate UI tests from the flow map."),
  runGeneratedTests: z.boolean().optional().describe("Run generated UI tests."),
  generateApiTests: z.boolean().optional().describe("Generate API tests from OpenAPI or configured endpoints."),
  runGeneratedApiTests: z.boolean().optional().describe("Run generated API tests."),
  allowDestructiveActions: z.boolean().optional().describe("Allow destructive product actions when generating/running checks."),
  maxPages: z.number().int().positive().optional().describe("Maximum pages for exploration."),
  maxActions: z.number().int().positive().optional().describe("Maximum interactive actions for exploration."),
  testId: z.string().optional().describe("Generated test id to rerun.")
};

export const productRerunToolSchema = {
  cwd: cwdSchema,
  target: targetSchema,
  testId: z.string().optional().describe("Generated test id. Defaults to the first latest failure."),
  checkKind: z.enum(["ui", "api", "workflow"]).optional().describe("Failed check kind when testId is supplied manually."),
  format: formatSchema,
  confirmExecution: z.boolean().optional().describe("Must be true before CodeDecay reruns product verification.")
};
