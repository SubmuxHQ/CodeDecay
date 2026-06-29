import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildDocsPage,
  copyStaticAssets,
  createSiteUrlBuilder,
  detectDefaultSiteUrl,
  discoverMarkdownFiles,
  getRequiredPage,
  groupBySection,
  normalizeBase,
  normalizeSiteUrl,
  sanitizeLinksForRawMarkdown,
  stripFrontmatter
} from "./lib/docs-artifacts.mjs";

const repoRoot = process.cwd();
const docsRoot = join(repoRoot, "docs");
const publicRoot = join(docsRoot, "public");
const markdownRoot = join(publicRoot, "markdown");
const llmsPath = join(publicRoot, "llms.txt");
const llmsFullPath = join(publicRoot, "llms-full.txt");
const wikiRoot = join(repoRoot, ".github", "wiki");
const wikiHomePath = join(wikiRoot, "Home.md");
const wikiSidebarPath = join(wikiRoot, "_Sidebar.md");

const docsBase = normalizeBase(process.env.DOCS_BASE ?? "/");
const siteUrl = normalizeSiteUrl(process.env.DOCS_SITE_URL ?? detectDefaultSiteUrl(repoRoot));
const withSiteUrl = createSiteUrlBuilder({ docsBase, siteUrl });

const orderedPages = [
  "index.md",
  "getting-started.md",
  "editor-workflows.md",
  "trend-snapshots.md",
  "github-action.md",
  "configuration.md",
  "redteam.md",
  "agent.md",
  "mcp.md",
  "github-app.md",
  "execution.md",
  "differential.md",
  "product-testing.md",
  "test-audit.md",
  "evals/first-efficacy-report.md",
  "tool-adapters.md",
  "skills.md",
  "memory.md",
  "llm-providers.md",
  "sample-reports/index.md",
  "sample-reports/sample-report.md",
  "scoring.md",
  "benchmark-corpus.md",
  "deployment-surfaces.md",
  "release-policy.md",
  "research.md",
  "releasing.md",
  "proposals/framework-aware-impact-map.md",
  "rfcs/0001-agent-agnostic-redteam-harness.md",
  "launch-post.md"
];

const sectionTitles = new Map([
  ["index.md", "Overview"],
  ["getting-started.md", "Guides"],
  ["editor-workflows.md", "Guides"],
  ["trend-snapshots.md", "Guides"],
  ["github-action.md", "Guides"],
  ["configuration.md", "Guides"],
  ["redteam.md", "Guides"],
  ["agent.md", "Guides"],
  ["mcp.md", "Guides"],
  ["github-app.md", "Guides"],
  ["execution.md", "Guides"],
  ["differential.md", "Guides"],
  ["product-testing.md", "Guides"],
  ["test-audit.md", "Guides"],
  ["evals/first-efficacy-report.md", "Guides"],
  ["tool-adapters.md", "Guides"],
  ["skills.md", "Guides"],
  ["memory.md", "Guides"],
  ["llm-providers.md", "Guides"],
  ["sample-reports/index.md", "Samples"],
  ["sample-reports/sample-report.md", "Samples"],
  ["scoring.md", "Reference"],
  ["benchmark-corpus.md", "Reference"],
  ["deployment-surfaces.md", "Reference"],
  ["release-policy.md", "Reference"],
  ["research.md", "Reference"],
  ["releasing.md", "Reference"],
  ["proposals/framework-aware-impact-map.md", "Roadmap"],
  ["rfcs/0001-agent-agnostic-redteam-harness.md", "Roadmap"],
  ["launch-post.md", "Misc"]
]);

const titleOverrides = new Map([
  ["index.md", "CodeDecay Docs"],
  ["sample-reports/sample-report.md", "Sample CodeDecay Markdown Report"]
]);

generate();

function generate() {
  rmSync(markdownRoot, { recursive: true, force: true });
  mkdirSync(markdownRoot, { recursive: true });
  mkdirSync(wikiRoot, { recursive: true });

  const discovered = discoverMarkdownFiles(docsRoot);
  const pageOrder = orderedPages.filter((path) => discovered.has(path));
  const pages = pageOrder.map((path) =>
    buildDocsPage({
      docsRoot,
      path,
      sectionTitles,
      titleOverrides,
      withSiteUrl
    })
  );
  copyStaticAssets({ docsRoot, publicRoot });

  for (const page of pages) {
    const target = join(markdownRoot, page.markdownPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sanitizeLinksForRawMarkdown(page.source), "utf8");
  }

  writeFileSync(llmsPath, renderLlmsIndex(pages), "utf8");
  writeFileSync(llmsFullPath, renderLlmsFull(pages), "utf8");
  writeFileSync(wikiHomePath, renderWikiHome(pages), "utf8");
  writeFileSync(wikiSidebarPath, renderWikiSidebar(pages), "utf8");
}

function renderLlmsIndex(pages) {
  const sections = groupBySection(pages);
  const lines = [
    "# CodeDecay Docs",
    "",
    "CodeDecay documentation for humans and AI agents.",
    "",
    "Use the site pages for HTML navigation, or prefer the raw Markdown copies under `/markdown/` and the full bundle in `/llms-full.txt` when building agent or retrieval workflows.",
    ""
  ];

  for (const [section, items] of sections) {
    lines.push(`## ${section}`, "");
    for (const page of items) {
      lines.push(`- [${page.title}](${page.pageUrl})`);
      lines.push(`  - Markdown: ${page.markdownUrl}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderLlmsFull(pages) {
  const lines = [
    "# CodeDecay Docs Bundle",
    "",
    "This is the concatenated Markdown bundle for the CodeDecay docs site.",
    ""
  ];

  for (const page of pages) {
    lines.push(`---`, "");
    lines.push(`# ${page.title}`, "");
    lines.push(`Source page: ${page.pageUrl}`);
    lines.push(`Raw markdown: ${page.markdownUrl}`);
    lines.push("");
    lines.push(stripFrontmatter(page.source).trim());
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderWikiHome(pages) {
  const pageByPath = new Map(pages.map((page) => [page.path, page]));
  const docsHome = getRequiredPage(pageByPath, "index.md");
  const gettingStarted = getRequiredPage(pageByPath, "getting-started.md");
  const githubAction = getRequiredPage(pageByPath, "github-action.md");
  const configuration = getRequiredPage(pageByPath, "configuration.md");
  const sampleReports = getRequiredPage(pageByPath, "sample-reports/index.md");

  const lines = [
    "# CodeDecay Wiki",
    "",
    "This wiki is a lightweight index for the main CodeDecay documentation site.",
    "",
    "Use the docs site for full navigation, search, and deploy-ready static pages. Use the raw endpoints when you want direct retrieval for agents and automation.",
    "",
    "## Primary Docs",
    "",
    `- [Docs Home](${docsHome.pageUrl})`,
    `- [Getting Started](${gettingStarted.pageUrl})`,
    `- [GitHub Action](${githubAction.pageUrl})`,
    `- [Configuration](${configuration.pageUrl})`,
    `- [Sample Reports](${sampleReports.pageUrl})`,
    "",
    "## Agent-Friendly Endpoints",
    "",
    `- [llms.txt](${withSiteUrl("/llms.txt")})`,
    `- [llms-full.txt](${withSiteUrl("/llms-full.txt")})`,
    `- [Docs Home Markdown](${docsHome.markdownUrl})`,
    `- [Getting Started Markdown](${gettingStarted.markdownUrl})`
  ];

  return `${lines.join("\n").trim()}\n`;
}

function renderWikiSidebar(pages) {
  const pageByPath = new Map(pages.map((page) => [page.path, page]));
  const docsHome = getRequiredPage(pageByPath, "index.md");
  const gettingStarted = getRequiredPage(pageByPath, "getting-started.md");
  const githubAction = getRequiredPage(pageByPath, "github-action.md");
  const configuration = getRequiredPage(pageByPath, "configuration.md");
  const sampleReports = getRequiredPage(pageByPath, "sample-reports/index.md");

  const lines = [
    "# CodeDecay",
    "",
    "- [Home](Home)",
    `- [Docs Home](${docsHome.pageUrl})`,
    `- [Getting Started](${gettingStarted.pageUrl})`,
    `- [GitHub Action](${githubAction.pageUrl})`,
    `- [Configuration](${configuration.pageUrl})`,
    `- [Sample Reports](${sampleReports.pageUrl})`,
    `- [llms.txt](${withSiteUrl("/llms.txt")})`,
    `- [llms-full.txt](${withSiteUrl("/llms-full.txt")})`
  ];

  return `${lines.join("\n").trim()}\n`;
}
