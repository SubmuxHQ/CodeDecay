# Local context service

The local context service is an incremental, repository-scoped wrapper around CodeDecay's existing engineering knowledge graph. It is local-only and does not make model, network, telemetry, install, or project-command calls.

## OSS-first decisions

- File watching uses Chokidar 4. It already normalizes native Node watcher behavior across supported platforms, supports ignored paths and write stabilization, and is already present in CodeDecay's dependency graph.
- Graph storage continues to use the inspectable JSON artifacts owned by `@submuxhq/codedecay-knowledge`. A separate graph database would duplicate the current index before scale measurements justify it.
- State writes use the existing local `.codedecay/local` boundary. Locking and local RPC remain transport concerns for the CLI/MCP service slice; they are not hidden behind this in-process foundation.

The service serializes rebuilds, coalesces watcher events, exposes invalidated paths and reasons, and labels every query as `current`, `refreshing`, or `stale`. A bounded query may wait for an active update, but old context is never returned as current. Corrupted or incompatible service state is quarantined and rebuilt without changing repository source files.

The initial implementation uses Chokidar for watching, inspectable JSON graph
artifacts, process locking via `.codedecay/local/context-service.lock`, and
atomic state writes to `.codedecay/local/context-service.json`.

## CLI

```bash
codedecay context serve --format json
codedecay context health --format json
codedecay context query --session-id agent-a --task "fix payouts" --format json
codedecay context rebuild --format json
codedecay context reset --format json
codedecay context stop
```

`serve` is local-only (no network bind by default). It watches the repo,
coalesces invalidations, and updates only invalidated path-linked nodes for
ordinary file edits. Git HEAD/index changes force a full rebuild.

## MCP

Tool: `context_service` with `operation=health|query|rebuild|start`.

## Remaining scale work

Benchmark fixtures and measured 1M+ LOC results remain recommended before
claiming large-monorepo scale. Documented path to 20M LOC: shard by package
workspace, persist per-package incremental graphs, and keep the current
service as the orchestration layer.
