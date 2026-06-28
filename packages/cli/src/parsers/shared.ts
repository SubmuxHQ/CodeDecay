import { HELP_DOCS } from "../docs/commands";
import { throwUnknownOption as throwUnknownOptionWithDocs } from "./diagnostics";

export class HelpRequested extends Error {}

export function throwUnknownOption(arg: string, command: keyof typeof HELP_DOCS): never {
  return throwUnknownOptionWithDocs({
    arg,
    command,
    docs: HELP_DOCS
  });
}
