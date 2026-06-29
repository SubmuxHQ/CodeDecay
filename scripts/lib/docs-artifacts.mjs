import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function discoverMarkdownFiles(root) {
  const files = new Set();

  visit(root);
  return files;

  function visit(currentDir) {
    for (const entry of readdirSync(currentDir)) {
      if (entry === ".vitepress" || entry === "public") {
        continue;
      }

      const absolutePath = join(currentDir, entry);
      const stats = statSync(absolutePath);

      if (stats.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (entry.endsWith(".md")) {
        files.add(relative(root, absolutePath).replaceAll("\\", "/"));
      }
    }
  }
}

export function copyStaticAssets({ docsRoot, publicRoot }) {
  visit(docsRoot);

  function visit(currentDir) {
    for (const entry of readdirSync(currentDir)) {
      if (entry === ".vitepress" || entry === "public") {
        continue;
      }

      const absolutePath = join(currentDir, entry);
      const stats = statSync(absolutePath);

      if (stats.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (entry.endsWith(".md")) {
        continue;
      }

      const relativePath = relative(docsRoot, absolutePath);
      const target = join(publicRoot, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(absolutePath));
    }
  }
}

export function buildDocsPage({ docsRoot, path, sectionTitles, titleOverrides, withSiteUrl }) {
  const absolutePath = join(docsRoot, path);
  const source = readFileSync(absolutePath, "utf8");
  const title = extractTitle({ source, path, titleOverrides });
  const pageRoute = toPageRoute(path);
  const markdownPath = path === "index.md" ? "index.md" : path.replace(/README\.md$/i, "index.md");

  return {
    path,
    title,
    section: sectionTitles.get(path) ?? "Guides",
    pageUrl: withSiteUrl(pageRoute),
    markdownUrl: withSiteUrl(`/markdown/${markdownPath}`),
    markdownPath,
    source
  };
}

export function getRequiredPage(pageByPath, path) {
  const page = pageByPath.get(path);
  if (!page) {
    throw new Error(`Expected docs page "${path}" to exist while generating wiki artifacts.`);
  }

  return page;
}

export function groupBySection(pages) {
  const grouped = new Map();

  for (const page of pages) {
    const pagesForSection = grouped.get(page.section) ?? [];
    pagesForSection.push(page);
    grouped.set(page.section, pagesForSection);
  }

  return grouped;
}

export function stripFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    return source;
  }

  const endIndex = source.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return source;
  }

  return source.slice(endIndex + 5);
}

export function sanitizeLinksForRawMarkdown(source) {
  return source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

export function normalizeBase(base) {
  if (!base) {
    return "/";
  }

  const prefixed = base.startsWith("/") ? base : `/${base}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

export function normalizeSiteUrl(value) {
  if (!value) {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function detectDefaultSiteUrl(repoRoot) {
  const repository = process.env.GITHUB_REPOSITORY ?? detectRepositoryFromGit(repoRoot);
  if (!repository) {
    return "";
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    return "";
  }

  return `https://${owner.toLowerCase()}.github.io/${repo}`;
}

export function createSiteUrlBuilder({ docsBase, siteUrl }) {
  return (path) => {
    const normalizedPath = joinBaseAndPath(docsBase, path);
    if (!siteUrl) {
      return normalizedPath;
    }

    return `${siteUrl}${normalizedPath}`;
  };
}

function extractTitle({ source, path, titleOverrides }) {
  const override = titleOverrides.get(path);
  if (override) {
    return override;
  }

  const content = stripFrontmatter(source);
  const match = content.match(/^#\s+(.+)$/m);
  if (match?.[1]) {
    return match[1].trim();
  }

  return path.replace(/\.md$/i, "");
}

function toPageRoute(path) {
  if (path === "index.md") {
    return "/";
  }

  if (path.endsWith("/index.md")) {
    return `/${path.slice(0, -"index.md".length)}`;
  }

  if (path.endsWith("/README.md")) {
    return `/${path.slice(0, -"README.md".length)}`;
  }

  return `/${path.replace(/\.md$/i, "")}`;
}

function detectRepositoryFromGit(repoRoot) {
  try {
    const remoteUrl = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

function joinBaseAndPath(base, path) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  if (base === "/") {
    return `/${cleanPath}`;
  }

  return `${base}${cleanPath}`;
}
