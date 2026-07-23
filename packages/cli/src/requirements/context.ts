import { normalizeRequirementContext, type RequirementContext } from "@submuxhq/codedecay-core";
import { loadRequirementArtifact } from "./load";

export function loadNormalizedRequirementContext(
  rootDir: string,
  requirementsPath: string | undefined,
  task: string | undefined
): RequirementContext | undefined {
  if (!requirementsPath) {
    return undefined;
  }
  const loaded = loadRequirementArtifact(rootDir, requirementsPath);
  const effectiveTask = task?.trim() || taskFromArtifact(loaded.context);
  if (!effectiveTask) {
    throw new Error("--requirements requires --task <description> or a task in the requirements artifact.");
  }
  return normalizeRequirementContext({
    task: effectiveTask,
    context: loaded.context,
    source: loaded.source
  });
}

function taskFromArtifact(context: ReturnType<typeof loadRequirementArtifact>["context"]): string | undefined {
  if (typeof context.task === "string") {
    return context.task;
  }
  return context.task?.text;
}
