# Local context service

The local context service is an incremental, repository-scoped wrapper around CodeDecay's existing engineering knowledge graph. It is local-only and does not make model, network, telemetry, install, or project-command calls.

## OSS-first decisions

- File watching uses Chokidar 4. It already normalizes native Node watcher behavior across supported platforms, supports ignored paths and write stabilization, and is already present in CodeDecay's dependency graph.
- Graph storage continues to use the inspectable JSON artifacts owned by `@submuxhq/codedecay-knowledge`. A separate graph database would duplicate the current index before scale measurements justify it.
- State writes use the existing local `.codedecay/local` boundary. Locking and local RPC remain transport concerns for the CLI/MCP service slice; they are not hidden behind this in-process foundation.

The service serializes rebuilds, coalesces watcher events, exposes invalidated paths and reasons, and labels every query as `current`, `refreshing`, or `stale`. A bounded query may wait for an active update, but old context is never returned as current. Corrupted or incompatible service state is quarantined and rebuilt without changing repository source files.

The initial implementation deliberately does not claim million-line scale. Benchmark fixtures and budgets, process locking, crash-safe atomic writes, and CLI/MCP transports remain required before the long-lived service is considered complete.
