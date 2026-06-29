import type { CommandDoc } from "../../renderers/discovery";

export function getKnownOptionFlags(command: string, docs: Record<string, CommandDoc>): string[] {
  const doc = resolveHelpTopic(command, docs);
  return [
    ...new Set([
      ...doc.options.map((option) => option.flag.split(" ", 1)[0] ?? option.flag),
      "--help",
      "-h"
    ])
  ];
}

export function resolveHelpTopic(topic: string, docs: Record<string, CommandDoc>): CommandDoc {
  const doc = docs[topic];
  if (!doc) {
    throw new Error(`Unknown help topic: ${topic}. Run "codedecay help" for available commands.`);
  }

  return doc;
}
