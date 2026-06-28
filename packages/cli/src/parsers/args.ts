import type {
  AnalyzeOptions,
  AgentOptions,
  DashboardOptions,
  DifferentialOptions,
  LlmReviewOptions,
  ProductOptions,
  RedteamOptions,
  SnapshotOptions
} from "../types";
import {
  parseAgentFormat,
  parseAgentProfile,
  parseConfigFormat,
  parseFormat,
  parsePositiveInteger,
  parseProductFailureClassifications,
  parseRedteamFormat,
  parseRiskLevel,
  requireValue
} from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export { parseConfigArgs } from "./config";
export { parseExecuteArgs } from "./execute";
export { parseMcpArgs } from "./mcp";
export { parseMemoryArgs, parseMemoryImportArgs, parseMemoryLearnArgs } from "./memory";
export { parseUninstallArgs, parseUpdateArgs } from "./maintenance";
export { HelpRequested } from "./shared";

export function parseProductArgs(args: string[]): ProductOptions {
  const options: ProductOptions = {
    format: "markdown",
    explore: false,
    generateTests: false,
    runGeneratedTests: false,
    generateApiTests: false,
    runGeneratedApiTests: false,
    maxPages: 10,
    maxActions: 50,
    allowDestructiveActions: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
      continue;
    }

    if (arg === "--target") {
      options.target = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--test-id=")) {
      options.testId = arg.slice("--test-id=".length);
      continue;
    }

    if (arg === "--test-id") {
      options.testId = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--fail-on-classification=")) {
      options.failOnClassifications = parseProductFailureClassifications(arg.slice("--fail-on-classification=".length), "--fail-on-classification");
      continue;
    }

    if (arg === "--fail-on-classification") {
      options.failOnClassifications = parseProductFailureClassifications(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--explore") {
      options.explore = true;
      continue;
    }

    if (arg === "--generate-tests") {
      options.generateTests = true;
      continue;
    }

    if (arg === "--run-generated-tests") {
      options.runGeneratedTests = true;
      continue;
    }

    if (arg === "--generate-api-tests") {
      options.generateApiTests = true;
      continue;
    }

    if (arg === "--run-generated-api-tests") {
      options.runGeneratedApiTests = true;
      continue;
    }

    if (arg.startsWith("--max-pages=")) {
      options.maxPages = parsePositiveInteger(arg.slice("--max-pages=".length), "--max-pages");
      continue;
    }

    if (arg === "--max-pages") {
      options.maxPages = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-actions=")) {
      options.maxActions = parsePositiveInteger(arg.slice("--max-actions=".length), "--max-actions");
      continue;
    }

    if (arg === "--max-actions") {
      options.maxActions = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--allow-destructive-actions") {
      options.allowDestructiveActions = true;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "product");
  }

  return options;
}

export function parseDashboardArgs(args: string[]): DashboardOptions {
  const options: DashboardOptions = {
    format: "markdown",
    inputPaths: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.inputPaths.push(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--input") {
      options.inputPaths.push(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "dashboard");
  }

  return options;
}

export function parseDifferentialArgs(args: string[]): DifferentialOptions {
  const options: DifferentialOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "differential");
  }

  return options;
}

export function parseSnapshotArgs(args: string[]): SnapshotOptions {
  const options: SnapshotOptions = {
    format: "json"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--compare=")) {
      options.compare = arg.slice("--compare=".length);
      continue;
    }

    if (arg === "--compare") {
      options.compare = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "snapshot");
  }

  return options;
}

export function parseLlmReviewArgs(args: string[]): LlmReviewOptions {
  const options: LlmReviewOptions = {
    format: "markdown",
    ping: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--ping") {
      options.ping = true;
      continue;
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--task=")) {
      options.task = arg.slice("--task=".length);
      continue;
    }

    if (arg === "--task") {
      options.task = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "llm-review");
  }

  return options;
}

export function parseRedteamArgs(args: string[]): RedteamOptions {
  const options: RedteamOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseRedteamFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseRedteamFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--fail-on=")) {
      options.failOn = parseRiskLevel(arg.slice("--fail-on=".length));
      continue;
    }

    if (arg === "--fail-on") {
      options.failOn = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "redteam");
  }

  return options;
}

export function parseAgentArgs(args: string[]): AgentOptions {
  const options: AgentOptions = {
    format: "markdown",
    profile: "generic"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseAgentFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseAgentFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profile = parseAgentProfile(arg.slice("--profile=".length));
      continue;
    }

    if (arg === "--profile") {
      options.profile = parseAgentProfile(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "agent");
  }

  return options;
}

export function parseAnalyzeArgs(args: string[]): AnalyzeOptions {
  const options: AnalyzeOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--fail-on=")) {
      options.failOn = parseRiskLevel(arg.slice("--fail-on=".length));
      continue;
    }

    if (arg === "--fail-on") {
      options.failOn = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "analyze");
  }

  return options;
}
