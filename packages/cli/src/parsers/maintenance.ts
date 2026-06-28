import type { UninstallOptions, UpdateOptions } from "../types";
import { parsePackageManager, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseUpdateArgs(args: string[]): UpdateOptions {
  const options: UpdateOptions = {
    apply: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
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

    if (arg.startsWith("--manager=")) {
      options.manager = parsePackageManager(arg.slice("--manager=".length));
      continue;
    }

    if (arg === "--manager") {
      options.manager = parsePackageManager(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "update");
  }

  return options;
}

export function parseUninstallArgs(args: string[]): UninstallOptions {
  const options: UninstallOptions = {
    apply: false,
    purgeLocal: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--purge-local") {
      options.purgeLocal = true;
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

    if (arg.startsWith("--manager=")) {
      options.manager = parsePackageManager(arg.slice("--manager=".length));
      continue;
    }

    if (arg === "--manager") {
      options.manager = parsePackageManager(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "uninstall");
  }

  return options;
}
