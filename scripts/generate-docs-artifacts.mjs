import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildDocsPage,
  copyStaticAssets,
  createSiteUrlBuilder,
  detectDefaultSiteUrl,
  discoverMarkdownFiles,
  normalizeBase,
  normalizeSiteUrl,
  sanitizeLinksForRawMarkdown,
} from "./lib/docs-artifacts.mjs";
import {
  orderedPages,
  sectionTitles,
  titleOverrides
} from "./lib/docs-pages.mjs";
import {
  renderLlmsFull,
  renderLlmsIndex,
  renderWikiHome,
  renderWikiSidebar
} from "./lib/docs-renderers.mjs";

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
  writeFileSync(wikiHomePath, renderWikiHome(pages, withSiteUrl), "utf8");
  writeFileSync(wikiSidebarPath, renderWikiSidebar(pages, withSiteUrl), "utf8");
}
