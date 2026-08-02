# Cross-repository service topology

CodeDecay's service-topology foundation models explicitly configured repositories, packages, services, deployment units, APIs, event topics, schemas, datastores, jobs, environments, and teams. It performs no repository cloning, network discovery, command execution, model calls, or telemetry.

Topology manifests use schema version `1` and may be JSON or YAML. Every node and edge has stable IDs, confidence, freshness, trust class, limitations, and at least one source containing a repository ID and revision. Local repository roots are explicit; missing roots remain visible as unavailable partial checkouts.

Dependency analysis follows declared consumer relationships to changed contracts and reports connected deployment units and owners. Stale or inferred relationships produce verification gaps and never become trusted evidence by themselves. Normalized artifacts are written to `.codedecay/local/service-topology.json` and remain inspectable.

This foundation does not yet expose CLI or MCP commands and does not yet parse OpenAPI or asynchronous contracts. Those adapters should use maintained OSS parsers and feed this model rather than creating a second topology engine.
