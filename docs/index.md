---
layout: home

hero:
  name: CodeDecay Docs
  text: PR safety docs for humans and AI agents
  tagline: Deterministic, local-first docs with deploy-ready llms.txt, llms-full.txt, and raw Markdown endpoints for agent tooling.
  actions:
    - theme: brand
      text: Start with the CLI
      link: /getting-started
    - theme: alt
      text: Wire GitHub Action
      link: /github-action
    - theme: alt
      text: Read llms.txt
      link: ./llms.txt
    - theme: alt
      text: Read llms-full.txt
      link: ./llms-full.txt

features:
  - title: Human-first docs
    details: Fast static pages, local search, edit links, last-updated metadata, and sample outputs for review and adoption.
  - title: Agent-ready by default
    details: Each deploy includes llms.txt, llms-full.txt, and stable raw Markdown copies under /markdown for tools and MCP clients.
  - title: Deterministic first
    details: The default CLI and GitHub Action workflow is local, deterministic, and free of hidden model calls. Optional assisted workflows are documented separately.
  - title: Repo-native
    details: The site reads the existing Markdown in this repository and builds with one command. No separate CMS, dashboard, or hosted docs lock-in.
  - title: Safe to host anywhere
    details: VitePress outputs static HTML, so the docs can be deployed on GitHub Pages, Vercel, Netlify, Cloudflare Pages, or any static host.
---

## Read This First

- [Getting Started](/getting-started): install the CLI and run your first PR analysis
- [GitHub Action](/github-action): add CodeDecay to pull request workflows
- [Redteam Reports](/redteam): generate merge-safety reports for yourself or your coding agent
- [Editor Workflows](/editor-workflows): surface JSON and SARIF findings in VS Code or other local tools before opening a PR
- [Trend Snapshots](/trend-snapshots): persist repository health snapshots and compare them over time without a hosted dashboard
- [Product Testing](/product-testing): configure live app targets and inspect UI/API failure bundles for agents and PRs
- [Agent Task Bundles](/agent): hand deterministic evidence to Codex, Claude Code, Cursor, Pi, OpenCode, or desktop agents
- [MCP Server](/mcp): expose CodeDecay as a local MCP tool for agent clients
- [Release Policy](/release-policy): understand the current compatibility contract before wiring CodeDecay into CI

## For Humans

- Use the sidebar and local search to navigate product docs quickly.
- Open [Sample Reports](/sample-reports/) to see the actual Markdown, JSON, and SARIF outputs before integrating CodeDecay.
- Use the GitHub edit links to tighten docs in the same repo that ships the code.

## For Agents

- [`/llms.txt`](/llms.txt): compact map of the docs site
- [`/llms-full.txt`](/llms-full.txt): one bundled Markdown context file
- <a href="./markdown/getting-started.md"><code>/markdown/getting-started.md</code></a>: per-page raw Markdown endpoints for direct retrieval

These endpoints are generated from the same source files as the docs site, so humans and agents read the same content instead of drifting copies.
