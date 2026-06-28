import type { ProductOptions } from "../types";
import {
  parseConfigFormat,
  parsePositiveInteger,
  parseProductFailureClassifications,
  requireValue
} from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

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
      options.failOnClassifications = parseProductFailureClassifications(
        arg.slice("--fail-on-classification=".length),
        "--fail-on-classification"
      );
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
