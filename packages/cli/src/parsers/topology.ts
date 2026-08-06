import type { TopologyOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseTopologyArgs(args: string[]): TopologyOptions {
  const options: TopologyOptions = {
    format: "markdown",
    openapi: [],
    asyncapi: [],
    changed: [],
    invalidate: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") throw new HelpRequested();
    const [flag, inline] = splitArg(arg);
    const value = () => inline ?? requireValue(args, index, flag);
    if (flag === "--cwd") options.cwd = value();
    else if (flag === "--output") options.output = value();
    else if (flag === "--format") options.format = parseFormat(value());
    else if (flag === "--manifest") options.manifest = value();
    else if (flag === "--openapi") options.openapi.push(value());
    else if (flag === "--asyncapi") options.asyncapi.push(value());
    else if (flag === "--local-graph") options.localGraph = value();
    else if (flag === "--changed") options.changed.push(value());
    else if (flag === "--invalidate") options.invalidate.push(value());
    else if (flag === "--repository-id") options.repositoryId = value();
    else if (flag === "--revision") options.revision = value();
    else if (flag === "--producer-service") options.producerServiceId = value();
    else if (flag === "--publisher-service") options.publisherServiceId = value();
    else if (flag === "--subscriber-service") options.subscriberServiceId = value();
    else {
      throwUnknownOption(arg, "topology");
      continue;
    }
    if (inline === undefined) index += 1;
  }

  return options;
}

function splitArg(arg: string): [string, string | undefined] {
  const index = arg.indexOf("=");
  return index < 0 ? [arg, undefined] : [arg.slice(0, index), arg.slice(index + 1)];
}

function parseFormat(value: string): TopologyOptions["format"] {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Invalid topology format "${value}". Expected json or markdown.`);
}
