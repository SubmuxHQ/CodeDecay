import type { CommandDoc } from "../renderers/discovery";
import { getKnownOptionFlags } from "./diagnostics/help-topics";
import { suggestClosestToken } from "./diagnostics/suggestions";

export function throwUnknownCommand(input: {
  command: string;
  docs: Record<string, CommandDoc>;
  rootFlagAliases: readonly string[];
}): never {
  const suggestion = suggestClosestToken(input.command, [...Object.keys(input.docs), ...input.rootFlagAliases]);
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
  throw new Error(`Unknown command: ${input.command}.${hint} Run "codedecay help" for available commands.`);
}

export function throwUnknownOption(input: {
  arg: string;
  command: string;
  docs: Record<string, CommandDoc>;
}): never {
  const suggestion = suggestClosestToken(input.arg, getKnownOptionFlags(input.command, input.docs));
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
  throw new Error(`Unknown option for codedecay ${input.command}: ${input.arg}.${hint} Run "codedecay help ${input.command}" to see supported options.`);
}
