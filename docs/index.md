---
layout: home

hero:
  name: CodeDecay
  text: Find what your coding agent missed before merge
  tagline: Open-source PR red-teaming for AI-built code with user-owned agents, real execution evidence, and local-first workflows.
  image:
    src: /hero.png
    alt: CodeDecay Judge Lab hero showing verified diff evidence
  actions:
    - theme: brand
      text: Start with the CLI
      link: /getting-started
    - theme: alt
      text: See a sample report
      link: /sample-reports/
    - theme: alt
      text: Wire GitHub Action
      link: /github-action
    - theme: alt
      text: Read llms.txt
      link: ./llms.txt

features:
  - title: Find real regressions
    details: Follow the changed code into routes, APIs, auth, config, schemas, and downstream product paths before a risky PR lands.
  - title: Audit test reality
    details: Separate runtime proof from static references, mocked boundaries, snapshots, and other tests that look safe without proving the production path.
  - title: Hand fixes to your agent
    details: Generate evidence-rich bundles for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP-compatible workflows.
  - title: Run explicit verification
    details: Bring configured tests, builds, probes, product checks, and OSS tool adapters into the same merge-safety loop when your repo allows execution.
  - title: Local-first by default
    details: No hidden telemetry, no required hosted service, and no forced model calls. Deterministic analysis works even when AI is disabled.
  - title: Human and agent readable
    details: The same source docs power the site, llms.txt, llms-full.txt, and raw Markdown endpoints so review guidance stays aligned everywhere.
---

## Start Here

- [Getting Started](/getting-started): install the CLI and run your first PR analysis
- [GitHub Action](/github-action): add CodeDecay to pull request workflows
- [Redteam Reports](/redteam): generate merge-safety reports for yourself or your coding agent
- [Closed-Loop Orchestration](/loop): drive a user-owned agent through fix and re-verify rounds
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
