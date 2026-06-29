import {
  normalizeArray,
  normalizeArchitectureNote,
  normalizeCommand,
  normalizeFlow,
  normalizeInvariant,
  normalizeMatcher,
  normalizeObject,
  normalizeRegression,
  optionalRiskLevel,
  optionalString,
  optionalStringArray,
  requiredString
} from "../schema";
import type {
  CodeDecayMemory,
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryRegression
} from "../types";
import {
  sortArchitecture,
  sortCommands,
  sortFlows,
  sortInvariants,
  sortRegressions
} from "./sort";

export function normalizeImportedMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  const object = normalizeObject(value, sourcePath, "root");
  if (object.version !== undefined && object.version !== 1) {
    throw new Error(`Invalid CodeDecay memory import at ${sourcePath}: version must be 1.`);
  }

  const flows = normalizeArray(object.flows, sourcePath, "flows").map((item, index) => normalizeFlow(item, index, sourcePath));
  const commands = normalizeArray(object.commands, sourcePath, "commands").map((item, index) => normalizeCommand(item, index, sourcePath));
  const invariants = normalizeArray(object.invariants, sourcePath, "invariants").map((item, index) =>
    normalizeInvariant(item, index, sourcePath)
  );
  const architecture = normalizeArray(object.architecture, sourcePath, "architecture").map((item, index) =>
    normalizeArchitectureNote(item, index, sourcePath)
  );
  const regressions = normalizeArray(object.regressions, sourcePath, "regressions").map((item, index) =>
    normalizeRegression(item, index, sourcePath)
  );
  const ciFailures = normalizeArray(object.ciFailures, sourcePath, "ciFailures").map((item, index) =>
    normalizeImportedRegression(item, index, sourcePath, "ciFailures")
  );
  const incidents = normalizeArray(object.incidents, sourcePath, "incidents").map((item, index) =>
    normalizeImportedRegression(item, index, sourcePath, "incidents")
  );
  const pullRequests = normalizeArray(object.pullRequests, sourcePath, "pullRequests").map((item, index) =>
    normalizeImportedPullRequest(item, index, sourcePath)
  );

  return {
    version: 1,
    flows: sortFlows([...flows, ...pullRequests.flatMap((entry) => entry.flows)]),
    commands: sortCommands([...commands, ...pullRequests.flatMap((entry) => entry.commands)]),
    invariants: sortInvariants(invariants),
    architecture: sortArchitecture([...architecture, ...pullRequests.flatMap((entry) => entry.architecture)]),
    regressions: sortRegressions([
      ...regressions,
      ...ciFailures,
      ...incidents,
      ...pullRequests.flatMap((entry) => entry.regressions)
    ])
  };
}

function normalizeImportedRegression(
  value: unknown,
  index: number,
  sourcePath: string,
  field: "ciFailures" | "incidents"
): MemoryRegression {
  const object = normalizeObject(value, sourcePath, `${field}[${index}]`);
  return {
    title: requiredString(object.title ?? object.name, sourcePath, `${field}[${index}].title`),
    description: requiredString(object.description ?? object.summary, sourcePath, `${field}[${index}].description`),
    check: optionalString(object.check, sourcePath, `${field}[${index}].check`),
    severity: optionalRiskLevel(object.severity, sourcePath, `${field}[${index}].severity`) ?? "high",
    ...normalizeMatcher(object, sourcePath, `${field}[${index}]`)
  };
}

function normalizeImportedPullRequest(
  value: unknown,
  index: number,
  sourcePath: string
): {
  flows: MemoryFlow[];
  commands: MemoryCommand[];
  architecture: MemoryArchitectureNote[];
  regressions: MemoryRegression[];
} {
  const object = normalizeObject(value, sourcePath, `pullRequests[${index}]`);
  const title = requiredString(object.title, sourcePath, `pullRequests[${index}].title`);
  const description =
    optionalString(object.description, sourcePath, `pullRequests[${index}].description`) ??
    optionalString(object.summary, sourcePath, `pullRequests[${index}].summary`) ??
    `Merged PR learning for ${title}.`;
  const matcher = normalizeMatcher(object, sourcePath, `pullRequests[${index}]`);
  const checks = optionalStringArray(object.checks, sourcePath, `pullRequests[${index}].checks`) ?? [];
  const command = optionalString(object.command, sourcePath, `pullRequests[${index}].command`);

  return {
    flows:
      checks.length > 0
        ? [
            {
              name: title,
              description,
              checks,
              ...matcher
            }
          ]
        : [],
    commands:
      command
        ? [
            {
              name: `${title} check`,
              command,
              description,
              ...matcher
            }
          ]
        : [],
    architecture: [
      {
        title,
        note: description,
        ...matcher
      }
    ],
    regressions:
      checks.length > 0
        ? [
            {
              title,
              description,
              check: checks[0],
              severity: "medium",
              ...matcher
            }
          ]
        : []
  };
}
