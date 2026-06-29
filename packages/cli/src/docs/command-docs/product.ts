import type { CommandDoc } from "../../renderers/discovery";

export const PRODUCT_COMMAND_DOCS: Record<string, CommandDoc> = {
  product: {
    name: "product",
    summary: "Check configured live app product targets.",
    usage: ["codedecay product [options]"],
    description: [
      "Inspect configured product testing targets, optionally start local targets when commands are explicitly allowed, and poll their health checks or base URLs."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--target <id>", description: "Run only one configured product target" },
      { flag: "--explore", description: "Use a project-provided Playwright install to crawl same-origin product flows" },
      { flag: "--generate-tests", description: "Generate reviewable Playwright regression tests from the target flow map" },
      { flag: "--run-generated-tests", description: "Run generated Playwright tests through the target repo's local Playwright CLI" },
      { flag: "--generate-api-tests", description: "Generate reviewable API regression tests from a configured OpenAPI schema" },
      { flag: "--run-generated-api-tests", description: "Run generated API tests through the target repo's local Playwright CLI" },
      { flag: "--test-id <id>", description: "When rerunning generated tests, target one generated test ID" },
      { flag: "--fail-on-classification <list>", description: "For product failures, exit non-zero only when a failure bundle has one of these comma-separated classifications" },
      { flag: "--max-pages <count>", description: "Maximum pages to visit during --explore (default: 10)" },
      { flag: "--max-actions <count>", description: "Maximum interactive elements to record during --explore (default: 50)" },
      { flag: "--allow-destructive-actions", description: "Record destructive forms/actions as allowed instead of blocked" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write product target report to a file instead of stdout" }
    ],
    examples: [
      "codedecay product --format markdown",
      "codedecay product --target web --format json",
      "codedecay product --target web --explore --max-pages 5 --format markdown",
      "codedecay product --target web --generate-tests --run-generated-tests --format markdown",
      "codedecay product --target api --generate-api-tests --run-generated-api-tests --format markdown",
      "codedecay product --target api --generate-api-tests --run-generated-api-tests --fail-on-classification confirmed-regression --format markdown",
      "codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
    ],
    notes: [
      "Product target commands run only when they are configured and `safety.allowCommands` is true.",
      "Existing `baseUrl` and preview URL targets are checked without starting commands.",
      "`--explore` is an explicit execution workflow and requires `safety.allowCommands: true` plus a project-provided Playwright install.",
      "Generated tests are written under `.codedecay/local/generated-tests/` and `.codedecay/local/generated-api-tests/` for review; CodeDecay never commits or promotes them automatically."
    ]
  },
  dashboard: {
    name: "dashboard",
    summary: "Generate a static product verification dashboard.",
    usage: ["codedecay dashboard [options]"],
    description: [
      "Discover local product run artifacts, redact sensitive values, and write a static HTML/JSON dashboard with per-failure bundle links."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--input <path>", description: "Additional product report JSON file or directory to include; can be repeated" },
      { flag: "--output <path>", description: "Dashboard output directory (default: .codedecay/local/dashboard)" },
      { flag: "--format <format>", description: "json or markdown summary to stdout (default: markdown)" }
    ],
    examples: [
      "codedecay dashboard",
      "codedecay dashboard --input .codedecay/local/product-trends --output public/codedecay-dashboard",
      "codedecay dashboard --format json"
    ],
    notes: [
      "Default discovery reads `.codedecay/local/product-runs/**/*.json` and `.codedecay/local/product-trends/**/*.json`.",
      "The generated dashboard is static and local-first. It does not upload artifacts or require a hosted service."
    ]
  }
};
