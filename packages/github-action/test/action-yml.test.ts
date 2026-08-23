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
      "fail-on-requirements",
      "format",
      "github-token",
      "head",
      "mode",
      "output",
      "preview-url",
      "product-explore",
      "product-fail-on-classification",
      "product-generate-api-tests",
      "product-generate-tests",
      "product-run-generated-api-tests",
      "product-run-generated-tests",
      "profile",
      "requirements",
      "target",
      "task",
      "with-checks"
    ]);
    expect(action.inputs.mode.default).toBe("analyze");
    expect(action.inputs["github-token"].default).toBe("${{ github.token }}");
  });

  it("passes action inputs through environment variables before constructing CLI arguments", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain('CODEDECAY_INPUT_CWD: "${{ inputs.cwd }}"');
    expect(actionYaml).toContain('args=("$MODE" --cwd "$CODEDECAY_INPUT_CWD" --format "$FORMAT")');
    expect(actionYaml).not.toContain('--cwd "${{ inputs.cwd }}"');
  });

  it("supports report modes and explicit product verification only", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain("analyze|redteam|agent|ai|product");
    expect(actionYaml).toContain('args=("product" --cwd "$CODEDECAY_INPUT_CWD" --format "$FORMAT")');
    expect(actionYaml).toContain("Unsupported CodeDecay mode");
    expect(actionYaml).toContain("does not support SARIF output");
    expect(actionYaml).not.toContain("analyze|redteam|agent|ai|product|execute");
  });

  it("posts sticky pull request comments without colliding with the GitHub App marker", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain("<!-- codedecay-action-report -->");
    expect(actionYaml).not.toContain("<!-- codedecay-github-app-report -->");
    expect(actionYaml).toContain("--format pr-comment");
    expect(actionYaml).toContain("gh api \"repos/$owner/$repo/issues/$number/comments?per_page=100\" --paginate");
    expect(actionYaml).toContain("--jq '.[] | select(.body != null");
    expect(actionYaml).toContain("gh api --method PATCH \"repos/$owner/$repo/issues/comments/$comment_id\"");
    expect(actionYaml).toContain("gh api --method POST \"repos/$owner/$repo/issues/$number/comments\"");
  });

  it("keeps pull request comments best effort", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain("CodeDecay PR comment skipped: github-token input is empty.");
    expect(actionYaml).toContain("CodeDecay PR comment skipped: event is not pull_request.");
    expect(actionYaml).toContain("failed to render pr-comment report");
    expect(actionYaml).toContain("failed to update existing PR comment");
    expect(actionYaml).toContain("failed to create PR comment");
  });

  it("wires product verification inputs without arbitrary command passthrough", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain('export CODEDECAY_PRODUCT_PREVIEW_URL="$CODEDECAY_INPUT_PREVIEW_URL"');
    expect(actionYaml).toContain('args+=(--target "$CODEDECAY_INPUT_TARGET")');
    expect(actionYaml).toContain("args+=(--explore)");
    expect(actionYaml).toContain("args+=(--generate-tests)");
    expect(actionYaml).toContain("args+=(--run-generated-tests)");
    expect(actionYaml).toContain("args+=(--generate-api-tests)");
    expect(actionYaml).toContain("args+=(--run-generated-api-tests)");
    expect(actionYaml).toContain('args+=(--fail-on-classification "$CODEDECAY_INPUT_PRODUCT_FAIL_ON_CLASSIFICATION")');
    expect(actionYaml).not.toContain("product-extra-args");
  });

  it("does not forward fail-on to agent mode", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain('if [[ "$MODE" != "agent" && -n "$CODEDECAY_INPUT_FAIL_ON" ]]; then');
  });

  it("wires the AI profile and explicit checks without arbitrary argument passthrough", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain('if [[ "$MODE" == "agent" || "$MODE" == "ai" ]]; then');
    expect(actionYaml).toContain('args+=(--profile "$CODEDECAY_INPUT_PROFILE")');
    expect(actionYaml).toContain('if [[ "$MODE" == "redteam" || "$MODE" == "ai" ]]; then');
    expect(actionYaml).toContain("args+=(--with-checks)");
    expect(actionYaml).not.toContain("agent-extra-args");
    expect(actionYaml).not.toContain("ai-extra-args");
  });

  it("forwards explicit structured requirement inputs and the opt-in CI gate", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain('if [[ -n "$CODEDECAY_INPUT_TASK" ]]; then');
    expect(actionYaml).toContain('args+=(--task "$CODEDECAY_INPUT_TASK")');
    expect(actionYaml).toContain('args+=(--requirements "$CODEDECAY_INPUT_REQUIREMENTS")');
    expect(actionYaml).toContain('args+=(--fail-on-requirements)');
    expect(actionYaml).not.toContain("pull_request.body");
  });

  it("builds the scoped npm package", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");

    expect(actionYaml).toContain("pnpm --filter @submuxhq/codedecay build");
    expect(actionYaml).not.toContain("pnpm --filter codedecay build");
  });

  it("does not interpolate action inputs directly into Bash commands", () => {
    const actionYaml = readFileSync("packages/github-action/action.yml", "utf8");
    const runBlocks = [...actionYaml.matchAll(/run: \|\n([\s\S]*?)(?=\n    - name:|$)/g)].map((match) => match[1]);

    expect(runBlocks).not.toHaveLength(0);
    for (const run of runBlocks) {
      expect(run).not.toMatch(/\$\{\{\s*inputs\./);
    }
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
