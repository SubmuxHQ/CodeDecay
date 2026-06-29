import { existsSync } from "node:fs";
import { join } from "node:path";
import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH } from "@submuxhq/codedecay-core";
import type { StartMcpServerOptions } from "../server/types";
import type { ProductRunToolInput } from "../tools/types";

export interface ProductCliInvocation {
  command: string;
  args: string[];
}

export function createProductRunArgs(rootDir: string, input: ProductRunToolInput): string[] {
  const args = [
    "product",
    "--cwd",
    rootDir,
    "--format",
    "json",
    "--output",
    CODEDECAY_PRODUCT_LATEST_REPORT_PATH
  ];

  if (input.target) {
    args.push("--target", input.target);
  }

  if (input.explore) {
    args.push("--explore");
  }

  if (input.generateTests) {
    args.push("--generate-tests");
  }

  if (input.runGeneratedTests) {
    args.push("--run-generated-tests");
  }

  if (input.generateApiTests) {
    args.push("--generate-api-tests");
  }

  if (input.runGeneratedApiTests) {
    args.push("--run-generated-api-tests");
  }

  if (input.allowDestructiveActions) {
    args.push("--allow-destructive-actions");
  }

  if (input.maxPages !== undefined) {
    args.push("--max-pages", String(input.maxPages));
  }

  if (input.maxActions !== undefined) {
    args.push("--max-actions", String(input.maxActions));
  }

  if (input.testId) {
    args.push("--test-id", input.testId);
  }

  return args;
}

export function resolveCodeDecayCliInvocation(
  serverOptions: StartMcpServerOptions,
  rootDir: string
): ProductCliInvocation | undefined {
  const configuredCliPath = serverOptions.cliPath ?? process.env.CODEDECAY_MCP_CLI_PATH;
  if (configuredCliPath && existsSync(configuredCliPath)) {
    return {
      command: process.execPath,
      args: [configuredCliPath]
    };
  }

  const projectBin = join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "codedecay.cmd" : "codedecay");
  if (existsSync(projectBin)) {
    return {
      command: projectBin,
      args: []
    };
  }

  return undefined;
}
