# Agent Skills

CodeDecay can load repo-local agent skills from:

```text
.agents/skills/*/SKILL.md
```

Skills are portable review instructions for the developer or their own agent.
They can help Codex, Claude Code, Cursor, MCP clients, desktop agents, or
internal company agents ask better PR-safety questions.

CodeDecay treats skill files as local, untrusted context:

- it does not execute skill content,
- it does not follow arbitrary links from skill files,
- it does not fetch external skills,
- it does not call an LLM,
- it does not send telemetry.

## Example

```text
.agents/skills/pr-red-team/SKILL.md
.agents/skills/test-quality-review/SKILL.md
```

Each skill should start with a Markdown title and a short first paragraph:

```markdown
# PR Red-Team Skill

Find what a coding agent may have missed before merge.
```

`codedecay redteam` includes a compact `Agent Skills` section with the skill
title, path, and summary. Full skill content stays in the repo-local skill file
for the user's agent to read when needed.

## Current Scope

The first loader only reads `.agents/skills/*/SKILL.md` from the analyzed repo.
Future adapters can map the same concept to other local or user-owned skill
systems, but the OSS default remains local-first.
