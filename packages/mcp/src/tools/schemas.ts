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
  "test-proof",
  "configured-check",
  "tool-adapter",
  "memory",
  "pattern",
  "product-failure"
]);
const impactedAreaKindSchema = z.enum(["api", "ui", "database", "auth", "config", "test", "source", "docs"]);
const requirementStatementSchema = z.union([
  z.string(),
  z.object({
    text: z.string().min(1),
    sourceIds: z.array(z.string()).optional()
  })
]);
const requirementContextSchema = z.object({
  confidence: z.enum(["low", "medium", "high"]).optional(),
  sources: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["task", "artifact", "issue", "pull-request", "repository", "memory", "integration"]),
    label: z.string().min(1),
    location: z.string().optional()
  })).optional(),
  task: requirementStatementSchema.optional(),
  currentBehavior: z.array(requirementStatementSchema).optional(),
  expectedBehavior: z.array(requirementStatementSchema).optional(),
  acceptanceCriteria: z.array(z.union([
    z.string(),
    z.object({
      id: z.string().optional(),
      text: z.string().min(1),
      requiredProof: z.array(z.string()).optional(),
      sourceIds: z.array(z.string()).optional()
    })
  ])).optional(),
  nonGoals: z.array(requirementStatementSchema).optional(),
  affectedFlows: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(["user", "api", "job", "data", "config"]),
    description: z.string().optional(),
    sourceIds: z.array(z.string()).optional()
  })).optional(),
  invariants: z.array(requirementStatementSchema).optional(),
  architectureConstraints: z.array(requirementStatementSchema).optional(),
  unresolvedQuestions: z.array(requirementStatementSchema).optional()
});

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

export const agentInvestigationToolSchema = {
  ...agentTaskBundleToolSchema,
  confirmInvestigation: z.boolean().optional().describe(
    "Must be true before CodeDecay calls the explicitly configured user-owned provider."
  )
};

export const agentPreflightToolSchema = {
  cwd: cwdSchema,
  task: z.string().min(1).describe("Intended task/change description before code generation."),
  requirements: requirementContextSchema.optional().describe("Structured acceptance criteria and product-flow context."),
  format: formatSchema
};

export const taskContextToolSchema = {
  cwd: cwdSchema,
  base: baseSchema,
  head: headSchema,
  task: z.string().min(1).describe("Task/change description used for deterministic context retrieval."),
  requirements: requirementContextSchema.optional().describe("Structured acceptance criteria and product-flow context."),
  format: formatSchema,
  maxNodes: z.number().int().positive().optional().describe("Maximum selected context nodes.")
};

export const contextServiceToolSchema = {
  cwd: cwdSchema,
  operation: z
    .enum(["health", "query", "rebuild", "start"])
    .optional()
    .describe("Local context service operation. Defaults to health."),
  sessionId: z.string().optional().describe("Optional agent session id for isolated task state."),
  task: z.string().optional().describe("Optional task label stored per session."),
  waitBudgetMs: z.number().int().nonnegative().optional().describe("Max wait for an in-flight index update.")
};

export const serviceTopologyToolSchema = {
  cwd: cwdSchema,
  format: formatSchema,
  manifest: z.string().optional().describe("Repo-local topology YAML/JSON manifest."),
  openapi: z.array(z.string()).optional().describe("Repo-local OpenAPI 3 contracts."),
  asyncapi: z.array(z.string()).optional().describe("Repo-local AsyncAPI 2/3 contracts."),
  localGraph: z.string().optional().describe("Optional local engineering/impact graph JSON."),
  changed: z.array(z.string()).optional().describe("Changed topology node ids."),
  invalidate: z.array(z.string()).optional().describe("Contract/manifest paths to incrementally rebuild."),
  repositoryId: z.string().optional().describe("Repository id for contract-derived nodes."),
  revision: z.string().optional().describe("Source revision for contract-derived nodes."),
  producerServiceId: z.string().optional().describe("Optional OpenAPI producer service id."),
  publisherServiceId: z.string().optional().describe("Optional AsyncAPI publisher service id."),
  subscriberServiceId: z.string().optional().describe("Optional AsyncAPI subscriber service id.")
};

export const runtimeEvidenceToolSchema = {
  cwd: cwdSchema,
  format: formatSchema,
  telemetry: z.string().optional().describe("Repo-local OTLP JSON trace export."),
  errors: z.string().optional().describe("Repo-local structured error/deployment export."),
  topology: z.string().optional().describe("Optional repo-local service topology manifest."),
  headRevision: z.string().optional().describe("Current source revision for trust classification."),
  environment: z.string().optional().describe("Environment label when an export omits one.")
};

export const agentSessionToolSchema = {
  cwd: cwdSchema,
  operation: z.enum(["start", "context", "checkpoint", "finish"]).describe("Session lifecycle operation."),
  sessionId: z.string().optional().describe("Stable session id. Optional for start, required afterward."),
  task: z.string().optional().describe("Required for start; intended task/change description before code generation."),
  requirements: requirementContextSchema.optional().describe("Structured acceptance criteria and product-flow context for start."),
  format: formatSchema,
  profile: z.enum(AGENT_PROFILE_IDS).optional().describe("User-owned agent handoff profile."),
  maxNodes: z.number().int().positive().optional().describe("Context node budget."),
  maxPromptChars: z.number().int().positive().optional().describe("Prompt character budget stored in the session."),
  checkpointKind: z.enum(["plan", "diff"]).optional().describe("Checkpoint kind. Defaults to plan."),
  summary: z.string().optional().describe("Agent-authored checkpoint or finish summary stored as untrusted data."),
  agentOutput: z.string().optional().describe("Optional agent-authored details stored as untrusted, redacted data.")
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
