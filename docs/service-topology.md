# Cross-repository service topology

CodeDecay's service-topology model covers repositories, packages, services,
deployment units, APIs, event topics, schemas, datastores, jobs, environments,
and teams. Edges include produces, consumes, calls, publishes, subscribes,
reads, writes, deploys-with, owns, versioned-by, compatibility-requires, and
contains.

Every node and edge carries source, repository/revision, confidence, freshness,
trust class, and limitations. Topology is local-first: explicit repository roots
and reviewable manifests only. There is no hidden cloning, network discovery,
install, model call, or telemetry.

## Adapters

| Source | Adapter | Parser choice |
|---|---|---|
| Topology manifest | YAML/JSON loader | Maintained `yaml` package for YAML; `JSON.parse` for JSON |
| OpenAPI 3 | Local contract adapter | Maintained `yaml` / JSON parse; remote `$ref` blocked |
| AsyncAPI 2/3 | Local contract adapter | Maintained `yaml` / JSON parse; remote `$ref` blocked |
| Local engineering/impact graph | `contains` linker | Reuses `#676` local graph artifacts |

Rejected alternatives for this slice: hosted service catalogs, automatic git
clone fans-out, and network-resolving OpenAPI/AsyncAPI parsers that fetch remote
refs by default.

## CLI / MCP

```bash
codedecay topology --manifest topology.yml --changed api:billing:v1 --format json
codedecay topology --manifest topology.yml --openapi docs/openapi.yaml --asyncapi docs/asyncapi.yaml --invalidate docs/openapi.yaml
```

MCP tool: `service_topology`.

Normalized artifacts are written to `.codedecay/local/service-topology.json`.
Incremental `--invalidate` rewrites only affected contract-linked nodes/edges.

## Trust rules

- Verified/declared current edges can produce downstream impact tasks.
- Inferred or stale edges emit verification gaps and never raise trusted risk alone.
- Unavailable repositories remain explicit gaps.
- Agent tasks include owners, repositories, and corroboration work.
