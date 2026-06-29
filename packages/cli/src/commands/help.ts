import { COMMAND_ORDER, HELP_DOCS, ROOT_FLAG_ALIASES, UTILITY_COMMAND_ORDER } from "../docs/commands";
import { writeStdout } from "../io";
import { throwUnknownCommand as throwUnknownCommandWithDocs } from "../parsers/diagnostics";
import {
  renderCommandHelp,
  renderCommandManual,
  renderRootHelp as renderRootHelpDocument,
  renderRootManual as renderRootManualDocument,
  type CommandDoc
} from "../renderers/discovery";
import type { CliRuntime } from "../types";

export function printHelp(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(
      runtime,
      renderRootHelpDocument({
        docs: HELP_DOCS,
        commandOrder: COMMAND_ORDER,
        utilityCommandOrder: UTILITY_COMMAND_ORDER
      })
    );
    return;
  }

  writeStdout(runtime, renderCommandHelp(resolveHelpTopic(topic)));
}

export function printManual(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(
      runtime,
      renderRootManualDocument({
        docs: HELP_DOCS,
        commandOrder: COMMAND_ORDER,
        utilityCommandOrder: UTILITY_COMMAND_ORDER
      })
    );
    return;
  }

  writeStdout(runtime, renderCommandManual(resolveHelpTopic(topic)));
}

export function throwUnknownCommand(command: string): never {
  return throwUnknownCommandWithDocs({
    command,
    docs: HELP_DOCS,
    rootFlagAliases: ROOT_FLAG_ALIASES
  });
}

function resolveHelpTopic(topic: string): CommandDoc {
  const doc = HELP_DOCS[topic];
  if (doc) {
    return doc;
  }

  throwUnknownCommand(topic);
}
