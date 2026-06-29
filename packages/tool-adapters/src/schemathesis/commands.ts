import {
  DEFAULT_SCHEMATHESIS_BASE_URL,
  DEFAULT_SCHEMATHESIS_SCHEMA
} from "./constants";
import type { SchemathesisHarnessOptions } from "../types";

export function resolveSchemathesisCommand(options: SchemathesisHarnessOptions): string {
  if (options.command !== undefined) {
    return options.command;
  }

  const schema = options.schema ?? DEFAULT_SCHEMATHESIS_SCHEMA;
  const baseUrl = options.baseUrl ?? DEFAULT_SCHEMATHESIS_BASE_URL;
  return `st run ${quoteShellArg(schema)} --url ${quoteShellArg(baseUrl)}`;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}
