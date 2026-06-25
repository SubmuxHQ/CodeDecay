import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("GitHub Action metadata", () => {
  it("is valid YAML and exposes the expected inputs", () => {
    const action = parse(readFileSync("packages/github-action/action.yml", "utf8"));

    expect(action.runs.using).toBe("composite");
    expect(Object.keys(action.inputs).sort()).toEqual([
      "base",
      "cwd",
      "fail-on",
      "format",
      "head",
      "mode",
      "output"
    ]);
    expect(action.inputs.mode.default).toBe("analyze");
  });

  it("forwards cwd to every CLI invocation", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");
    const invocations = actionYaml.match(/args=\("\$MODE"[^\n]+/g) ?? [];

    expect(invocations).toHaveLength(2);
    expect(invocations.every((line) => line.includes("--cwd \"${{ inputs.cwd }}\""))).toBe(true);
  });

  it("supports only report-only modes", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain("analyze|redteam|agent");
    expect(actionYaml).toContain("Unsupported CodeDecay mode");
    expect(actionYaml).toContain("does not support SARIF output");
    expect(actionYaml).not.toContain("analyze|redteam|agent|execute");
  });

  it("does not forward fail-on to agent mode", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain('if [[ "$MODE" != "agent" && -n "${{ inputs.fail-on }}" ]]; then');
  });

  it("builds the scoped npm package", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain("pnpm --filter @submuxhq/codedecay build");
    expect(actionYaml).not.toContain("pnpm --filter codedecay build");
  });

  it("documents only supported action inputs in examples", () => {
    const action = parse(readFileSync("packages/github-action/action.yml", "utf8"));
    const supportedInputs = new Set(Object.keys(action.inputs));
    const docs = readFileSync("docs/github-action.md", "utf8");
    const documentedInputs = extractCodeDecayActionInputs(docs);

    expect(documentedInputs).toContain("cwd");
    expect(documentedInputs.every((input) => supportedInputs.has(input))).toBe(true);
  });

  it("documents output paths relative to cwd", () => {
    const action = parse(readFileSync("packages/github-action/action.yml", "utf8"));
    const docs = readFileSync("docs/github-action.md", "utf8");

    expect(action.inputs.output.description).toContain("Relative paths resolve from cwd");
    expect(docs).toContain("Relative `output` paths resolve from `cwd`.");
    expect(docs).toContain("Absolute `output` paths are honored exactly.");
  });
});

function extractCodeDecayActionInputs(markdown: string): string[] {
  const inputs: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let inCodeDecayStep = false;
  let inWithBlock = false;
  let withIndent = 0;

  for (const line of lines) {
    if (line.includes("uses: SubmuxHQ/CodeDecay/packages/github-action@v0")) {
      inCodeDecayStep = true;
      inWithBlock = false;
      continue;
    }

    if (!inCodeDecayStep) {
      continue;
    }

    const indent = line.match(/^ */)?.[0].length ?? 0;
    if (line.trim() === "with:") {
      inWithBlock = true;
      withIndent = indent;
      continue;
    }

    if (inWithBlock && line.trim() && indent <= withIndent) {
      inCodeDecayStep = false;
      inWithBlock = false;
      continue;
    }

    if (inWithBlock) {
      const match = line.match(/^\s+([a-z][a-z-]*):/);
      if (match?.[1]) {
        inputs.push(match[1]);
      }
    }
  }

  return inputs;
}
