import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

interface ActionInput {
  default?: unknown;
}

interface ActionStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface CompositeAction {
  inputs: Record<string, ActionInput>;
  runs: {
    steps: ActionStep[];
  };
}

export interface ActionStepResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunActionStepOptions {
  actionDefinitionPath: string;
  actionPath: string;
  workspace: string;
  runnerTemp: string;
  stepName: string;
  inputs?: Record<string, string | undefined>;
  env?: NodeJS.ProcessEnv;
}

export function runActionStep(options: RunActionStepOptions): ActionStepResult {
  const action = parse(readFileSync(options.actionDefinitionPath, "utf8")) as CompositeAction;
  const step = action.runs.steps.find((candidate) => candidate.name === options.stepName);
  if (!step?.run) {
    throw new Error(`Action step is missing executable shell: ${options.stepName}`);
  }

  const inputValues = resolveInputValues(action.inputs, options.inputs ?? {});
  const script = substituteInputs(step.run, inputValues);
  const stepEnv = Object.fromEntries(
    Object.entries(step.env ?? {}).map(([name, value]) => [name, substituteInputs(value, inputValues)])
  );
  const result = spawnSync("bash", ["-c", script], {
    cwd: options.workspace,
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...process.env,
      GITHUB_ACTION_PATH: options.actionPath,
      GITHUB_WORKSPACE: options.workspace,
      RUNNER_TEMP: options.runnerTemp,
      GITHUB_STEP_SUMMARY: `${options.runnerTemp}/github-step-summary.md`,
      ...options.env,
      ...stepEnv
    }
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT"
  };
}

function resolveInputValues(
  definitions: Record<string, ActionInput>,
  supplied: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      if (Object.prototype.hasOwnProperty.call(supplied, name)) {
        return [name, supplied[name] ?? ""];
      }

      const defaultValue = definition.default;
      if (typeof defaultValue !== "string" || defaultValue.startsWith("${{")) {
        return [name, ""];
      }
      return [name, defaultValue];
    })
  );
}

function substituteInputs(source: string, inputs: Record<string, string>): string {
  let rendered = source;
  for (const [name, value] of Object.entries(inputs)) {
    rendered = rendered.replaceAll(`\${{ inputs.${name} }}`, value);
  }

  const unresolved = rendered.match(/\$\{\{\s*inputs\.[^}]+\}\}/);
  if (unresolved) {
    throw new Error(`Unresolved Action input expression: ${unresolved[0]}`);
  }
  return rendered;
}
