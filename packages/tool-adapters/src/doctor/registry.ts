import type { ExternalToolCapability } from "./types";

export const EXTERNAL_TOOL_REGISTRY: ExternalToolCapability[] = [
  {
    id: "semgrep",
    name: "Semgrep",
    purpose: "Static bug and security rule scanning across application code.",
    categories: ["static-analysis", "security", "code-quality"],
    install: {
      npm: "npm install -D semgrep",
      pnpm: "pnpm add -D semgrep",
      yarn: "yarn add -D semgrep",
      bun: "bun add -d semgrep",
      pipx: "pipx install semgrep",
      brew: "brew install semgrep"
    },
    defaultCommand: "semgrep scan --config .semgrep.yml --json --metrics=off --disable-version-check",
    evidence: "Semgrep JSON findings with rule id, severity, file, line, and message.",
    docsUrl: "https://semgrep.dev/docs/",
    license: "LGPL-2.1",
    requiresExecution: true,
    mayUseNetwork: false,
    codeDecayAdapter: "semgrep"
  },
  {
    id: "stryker",
    name: "StrykerJS",
    purpose: "Mutation testing to show whether tests catch real behavior changes.",
    categories: ["mutation-testing", "test-quality"],
    install: {
      npm: "npm install -D @stryker-mutator/core",
      pnpm: "pnpm add -D @stryker-mutator/core",
      yarn: "yarn add -D @stryker-mutator/core",
      bun: "bun add -d @stryker-mutator/core"
    },
    defaultCommand: "pnpm exec stryker run",
    evidence: "Stryker mutation report with surviving and no-coverage mutants.",
    docsUrl: "https://stryker-mutator.io/docs/",
    license: "Apache-2.0",
    requiresExecution: true,
    mayUseNetwork: false,
    codeDecayAdapter: "stryker"
  },
  {
    id: "schemathesis",
    name: "Schemathesis",
    purpose: "Property-based API fuzzing for OpenAPI and GraphQL services.",
    categories: ["api-fuzzing", "contract", "runtime"],
    install: {
      pipx: "pipx install schemathesis",
      pip: "python -m pip install schemathesis"
    },
    defaultCommand: "st run docs/openapi.yaml --url http://127.0.0.1:3000",
    evidence: "API fuzzing failures with generated request/response evidence.",
    docsUrl: "https://schemathesis.readthedocs.io/",
    license: "MIT",
    requiresExecution: true,
    mayUseNetwork: false,
    codeDecayAdapter: "schemathesis"
  },
  {
    id: "playwright",
    name: "Playwright",
    purpose: "Browser checks for real user flows and frontend regressions.",
    categories: ["browser", "e2e", "runtime"],
    install: {
      npm: "npm install -D @playwright/test",
      pnpm: "pnpm add -D @playwright/test",
      yarn: "yarn add -D @playwright/test",
      bun: "bun add -d @playwright/test"
    },
    defaultCommand: "pnpm exec playwright test",
    evidence: "Browser test pass/fail output, traces, screenshots, and reports when configured.",
    docsUrl: "https://playwright.dev/docs/intro",
    license: "Apache-2.0",
    requiresExecution: true,
    mayUseNetwork: false,
    codeDecayAdapter: "playwright"
  },
  {
    id: "coverage",
    name: "Istanbul/c8/nyc coverage",
    purpose: "Coverage evidence for whether changed behavior is measured by tests.",
    categories: ["coverage", "test-quality"],
    install: {
      npm: "npm install -D c8",
      pnpm: "pnpm add -D c8",
      yarn: "yarn add -D c8",
      bun: "bun add -d c8"
    },
    defaultCommand: "pnpm test -- --coverage",
    evidence: "Istanbul, LCOV, or V8 coverage artifacts.",
    docsUrl: "https://istanbul.js.org/",
    license: "BSD-3-Clause",
    requiresExecution: true,
    mayUseNetwork: false,
    codeDecayAdapter: "coverage"
  },
  {
    id: "pact",
    name: "Pact",
    purpose: "Consumer-driven contract testing for service/API compatibility.",
    categories: ["contract", "api", "runtime"],
    install: {
      npm: "npm install -D @pact-foundation/pact",
      pnpm: "pnpm add -D @pact-foundation/pact",
      yarn: "yarn add -D @pact-foundation/pact",
      bun: "bun add -d @pact-foundation/pact"
    },
    defaultCommand: "pnpm run test:pact",
    evidence: "Contract verification output from the project's Pact test command.",
    docsUrl: "https://docs.pact.io/",
    license: "MIT",
    requiresExecution: true,
    mayUseNetwork: false,
    codeDecayAdapter: "pact"
  },
  {
    id: "osv-scanner",
    name: "OSV-Scanner",
    purpose: "Open-source dependency vulnerability scanning using OSV data.",
    categories: ["dependencies", "security", "supply-chain"],
    install: {
      brew: "brew install osv-scanner",
      manual: "See https://google.github.io/osv-scanner/installation/"
    },
    defaultCommand: "osv-scanner --lockfile pnpm-lock.yaml",
    evidence: "Dependency vulnerability findings from OSV advisories.",
    docsUrl: "https://google.github.io/osv-scanner/",
    license: "Apache-2.0",
    requiresExecution: true,
    mayUseNetwork: true
  },
  {
    id: "openssf-scorecard",
    name: "OpenSSF Scorecard",
    purpose: "Repository and supply-chain security posture checks.",
    categories: ["supply-chain", "security", "repository"],
    install: {
      brew: "brew install scorecard",
      manual: "See https://github.com/ossf/scorecard"
    },
    defaultCommand: "scorecard --repo .",
    evidence: "Repository security posture checks such as branch protection, dependency update tooling, and token permissions.",
    docsUrl: "https://github.com/ossf/scorecard",
    license: "Apache-2.0",
    requiresExecution: true,
    mayUseNetwork: true
  }
];

export function getExternalTool(id: string): ExternalToolCapability | undefined {
  return EXTERNAL_TOOL_REGISTRY.find((tool) => tool.id === id);
}
