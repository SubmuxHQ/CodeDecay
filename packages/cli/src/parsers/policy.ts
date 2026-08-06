import type { PolicyOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parsePolicyArgs(args: string[]): PolicyOptions {
  const options: PolicyOptions = {
    policyDirs: [],
    orgPolicyDirs: [],
    approvalDirs: [],
    exceptionDirs: [],
    changedPaths: [],
    format: "markdown"
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") throw new HelpRequested();
    const [flag, inline] = splitArg(arg);
    const value = () => inline ?? requireValue(args, index, flag);
    if (flag === "--policies") options.policyDirs.push(value());
    else if (flag === "--org-policies") options.orgPolicyDirs.push(value());
    else if (flag === "--approvals") options.approvalDirs.push(value());
    else if (flag === "--exceptions") options.exceptionDirs.push(value());
    else if (flag === "--changed") options.changedPaths.push(value());
    else if (flag === "--change-class") options.changeClass = parseChangeClass(value());
    else if (flag === "--now") options.now = value();
    else if (flag === "--cwd") options.cwd = value();
    else if (flag === "--output") options.output = value();
    else if (flag === "--format") options.format = parseFormat(value());
    else {
      throwUnknownOption(arg, "policy");
      continue;
    }
    if (inline === undefined) index += 1;
  }
  if (!options.policyDirs.length) options.policyDirs.push(".codedecay/policies");
  if (!options.approvalDirs.length) options.approvalDirs.push(".codedecay/approvals");
  if (!options.exceptionDirs.length) options.exceptionDirs.push(".codedecay/exceptions");
  return options;
}

function splitArg(arg: string): [string, string | undefined] {
  const index = arg.indexOf("=");
  return index < 0 ? [arg, undefined] : [arg.slice(0, index), arg.slice(index + 1)];
}

function parseFormat(value: string): PolicyOptions["format"] {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Invalid policy format "${value}". Expected json or markdown.`);
}

function parseChangeClass(value: string): NonNullable<PolicyOptions["changeClass"]> {
  if (
    value === "docs" ||
    value === "migration" ||
    value === "source" ||
    value === "protected-path" ||
    value === "test" ||
    value === "config" ||
    value === "unknown"
  ) {
    return value;
  }
  throw new Error(`Invalid policy change class "${value}".`);
}
