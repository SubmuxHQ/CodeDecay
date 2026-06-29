import {
  getRequiredPage,
  groupBySection,
  stripFrontmatter
} from "./docs-artifacts.mjs";

export function renderLlmsIndex(pages) {
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

export function renderLlmsFull(pages) {
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

export function renderWikiHome(pages, withSiteUrl) {
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

export function renderWikiSidebar(pages, withSiteUrl) {
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
