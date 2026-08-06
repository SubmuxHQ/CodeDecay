# CodeDecay Threat Model

Status: maintained security baseline for issue
[#690](https://github.com/SubmuxHQ/CodeDecay/issues/690).

This document describes how CodeDecay treats untrusted inputs, which
capabilities are dangerous, and what the default-deny policy is intended to
block. It is not a claim of perfect isolation.

## Assets

| Asset | Why it matters |
| --- | --- |
| Repository source and secrets in the working tree | Primary confidential and integrity target |
| User-configured commands, probes, and product targets | Can mutate the machine or contact services |
| Local memory, skills, ADRs, and docs | Can inject instructions into agent workflows |
| Model/provider credentials and env vars | Exfiltration and unauthorized spend |
| Generated experiment plans and agent patches | Untrusted executable suggestions |
| Capability audit log and reports | Accountability and evidence integrity |
| Git history, worktrees, and CI artifacts | Integrity of base/head comparison |

## Trust zones

```text
Untrusted
  repository content, memory, MCP tool results, model output,
  agent patches, generated experiments, command stdout/stderr,
  telemetry exports

Configured (user-owned, still not fully trusted as code)
  .codedecay/config.*, design contracts, explicit CLI flags,
  safety.allowCommands, capabilityPolicy.allow entries

Trusted runtime boundary
  CodeDecay packages that authorize, audit, and spawn processes
  through packages/execution

Out of scope unless explicitly configured
  production deploy, production migrate, remote push/merge,
  package publish, cluster/infra mutation
```

## Actors

- **Developer / CI operator** — configures policy and intents.
- **User-owned coding agent** — proposes edits and checks; never self-approves
  capabilities.
- **External model provider** (Ollama / LiteLLM) — optional, explicit only.
- **Malicious repository author** — plants prompt injection, symlink traps,
  or shell-substituted experiment plans.
- **Compromised MCP/tool adapter** — returns forged success or hostile commands.

## Data flows

1. Git diff and file reads → deterministic analysis (`analyzer-js`).
2. Config + memory + skills → redteam / agent packaging (suggestions only).
3. Optional LLM investigation → untrusted hypotheses, never risk scores.
4. `runConfiguredCommand` → capability authorize → safety denylist → spawn →
   audit.
5. Reports / MCP / agent bundles → local artifacts; no hidden upload.

## Attack surfaces and abuse cases

| Abuse case | Default control |
| --- | --- |
| Prompt injection asks agent to read secrets and upload them | `secret.env` and `network` denied; untrusted intent sources cannot grant |
| Generated experiment with `$(...)` / backticks | Command rejected before spawn |
| Symlink escape from artifact directory | Canonical path must stay under allowed roots |
| Config or memory text claims `allowCommands: true` without loaded config | Only normalized loaded config + caller intent authorize |
| Agent declares a check “verified” | Agent text is never trusted evidence |
| Destructive `rm -rf`, push, deploy, migrate | Pattern denylist in `checkCommandSafety` |
| Silent model or network use | LLM provider defaults to `disabled`; network capability default-deny |

## Capability policy (version 1)

Capabilities:

`model.call`, `command.execute`, `fs.read`, `fs.write`, `network`,
`secret.env`, `package.install`, `process.start`, `browser`, `database`,
`repo.access`, `git.mutate`, `artifact.persist`.

Defaults deny elevated actions. `safety.allowCommands: true` is explicit
user intent for `command.execute` on configured commands. It does not grant
network, secrets, installs, git mutation, or model calls.

Agent, memory, MCP, and generated-experiment text alone cannot flip a
capability to allowed.

## Residual risks

- OS process isolation / sandboxing is platform-dependent; missing sandbox
  features must degrade to blocked or visibly weaker isolation, never silent
  full access (follow-up under #690).
- Live redirect/SSRF validation for approved HTTP targets is not complete in
  the foundation slice.
- MCP confirmation scopes still need per-tool narrowing beyond the shared
  authorize gate.
- Command denylist is heuristic; allowlisted user commands can still be
  dangerous if the user authorizes them.

## Audit

Capability decisions append to
`.codedecay/local/capability-audit.jsonl` when a repository cwd is available.
Events cover requested, granted, denied, started, completed, timed-out, and
cancelled phases for attributable review.
