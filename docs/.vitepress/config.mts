import { defineConfig } from "vitepress";

const rawBase = process.env.DOCS_BASE ?? "/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

export default defineConfig({
  title: "CodeDecay",
  description: "PR safety docs for humans and AI agents",
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["sample-reports/README.md"],
  sitemap: {
    hostname: process.env.DOCS_SITE_URL
  },
  head: [
    ["link", { rel: "icon", type: "image/png", href: `${base}logo.png` }],
    ["link", { rel: "apple-touch-icon", href: `${base}logo.png` }],
    ["meta", { name: "theme-color", content: "#c95d12" }],
    [
      "meta",
      {
        name: "description",
        content:
          "Open-source docs for CodeDecay: regression-risk analysis, redteam workflow, MCP integration, GitHub Action setup, and agent-ready llms.txt bundles."
      }
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "CodeDecay" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Find what your coding agent missed before merge with local-first PR red-teaming, product checks, and agent-ready handoff docs."
      }
    ],
    ["meta", { property: "og:image", content: `${base}hero.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: `${base}hero.png` }]
  ],
  themeConfig: {
    logo: {
      src: "/logo.png",
      alt: "CodeDecay"
    },
    nav: [
      { text: "Start", link: "/getting-started" },
      { text: "GitHub Action", link: "/github-action" },
      { text: "Redteam", link: "/redteam" },
      { text: "MCP", link: "/mcp" },
      { text: "Hackathon", link: "/hackathon/" },
      { text: "AI Bundle", link: `${base}llms.txt` }
    ],
    sidebar: [
      {
        text: "Overview",
        items: [
          { text: "Docs Home", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Editor Workflows", link: "/editor-workflows" },
          { text: "Trend Snapshots", link: "/trend-snapshots" },
          { text: "GitHub Action", link: "/github-action" },
          { text: "Sample Reports", link: "/sample-reports/" },
          { text: "Scoring Model", link: "/scoring" },
          { text: "Benchmark Corpus", link: "/benchmark-corpus" },
          { text: "Hackathon Submission", link: "/hackathon/" },
          { text: "Release Policy", link: "/release-policy" },
          { text: "Research Basis", link: "/research" }
        ]
      },
      {
        text: "Workflows",
        items: [
          { text: "Configuration", link: "/configuration" },
          { text: "Redteam Reports", link: "/redteam" },
          { text: "Agent Task Bundles", link: "/agent" },
          { text: "Requirement Traceability", link: "/requirement-trace" },
          { text: "Closed-Loop Orchestration", link: "/loop" },
          { text: "MCP Server", link: "/mcp" },
          { text: "GitHub App", link: "/github-app" },
          { text: "Execution Probes", link: "/execution" },
          { text: "Differential Checks", link: "/differential" },
          { text: "Product Testing", link: "/product-testing" },
          { text: "Product Dashboard", link: "/product-dashboard" },
          { text: "Test Audit", link: "/test-audit" },
          { text: "PR Safety Evals", link: "/evals/first-efficacy-report" },
          { text: "Tool Adapters", link: "/tool-adapters" },
          { text: "Agent Skills", link: "/skills" },
          { text: "Local Repo Memory", link: "/memory" },
          { text: "LLM Providers", link: "/llm-providers" },
          { text: "Deployment Surfaces", link: "/deployment-surfaces" }
        ]
      },
      {
        text: "Design",
        items: [
          { text: "Framework-Aware Impact Map", link: "/proposals/framework-aware-impact-map" },
          {
            text: "RFC 0001: Agent-Agnostic Redteam Harness",
            link: "/rfcs/0001-agent-agnostic-redteam-harness"
          },
          {
            text: "RFC 0002: Unified Local-First Safety Harness",
            link: "/rfcs/0002-unified-harness"
          },
          {
            text: "RFC 0003: Test-First UAT and Agentic QA",
            link: "/rfcs/0003-test-first-uat-usability-agentic-qa"
          },
          { text: "Releasing", link: "/releasing" },
          { text: "Launch Post", link: "/launch-post" }
        ]
      }
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/SubmuxHQ/CodeDecay" }],
    search: {
      provider: "local"
    },
    outline: {
      level: [2, 3]
    },
    editLink: {
      pattern: "https://github.com/SubmuxHQ/CodeDecay/edit/main/docs/:path",
      text: "Edit this page on GitHub"
    },
    docFooter: {
      prev: "Previous",
      next: "Next"
    },
    footer: {
      message: "Local-first docs for merge safety, redteam workflows, and agent handoff.",
      copyright: "Apache-2.0"
    }
  }
});
