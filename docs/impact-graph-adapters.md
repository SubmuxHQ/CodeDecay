# Impact Graph Adapter Contract

CodeDecay normalizes language and framework evidence into one versioned impact
graph. The graph lets reports and user-owned coding agents explain which
downstream files, routes, tests, and product surfaces may be affected, which
adapter supplied each relationship, and how certain that relationship is.

This contract is orchestration infrastructure. It does not replace the existing
JavaScript/TypeScript symbol graph or change risk scoring.

## Current Adapter

The first adapter bridges CodeDecay's existing Babel-backed JavaScript and
TypeScript symbol graph:

```text
adapter: codedecay-js-babel-symbols
source tool: @babel/parser
artifact: .codedecay/local/impact-graph.json
```

It emits file, route, test, and symbol nodes plus `contains`, `imports`, and
`tests` edges. Explicit static imports are marked `direct`. For a `tests` edge,
`direct` means the parser directly observed the import. It does not mean the
test executed the symbol or asserted its behavior; that limitation is stored on
the edge and included in the graph summary.

Its limitations are reported with the graph:

- only JavaScript and TypeScript files parsed by Babel are represented,
- dynamic imports and runtime dependency injection are not resolved,
- call expressions are not connected to target symbols yet.

Python and additional framework adapters remain follow-up work under
[#668](https://github.com/SubmuxHQ/CodeDecay/issues/668). An unavailable
optional adapter must report its capabilities and limitations without installing
anything or running commands, network requests, telemetry, or model calls.

## Contract Shape

Each adapter contributes a fragment with:

- schema version,
- adapter ID and version,
- source tool and optional source-tool version,
- availability status,
- supported node and edge kinds,
- explicit limitations,
- fragment-local nodes and edges.

The normalizer prefixes every local ID with the adapter ID. Two adapters can
both emit `entry` without colliding:

```text
language-a::entry
framework-b::entry
```

Supported node kinds cover:

```text
file, route, api, ui, product-flow, symbol, package, persistence, schema,
job, event, config, env, test
```

Supported edge kinds cover:

```text
imports, calls, contains, serves, reads, writes, produces, consumes,
configures, tests, flows-to
```

Every normalized edge includes:

- adapter ID and version,
- source tool and optional source-tool version,
- confidence,
- human-readable evidence,
- repository-relative source location when available,
- edge-specific limitations.

## Confidence

Confidence is evidence strength, not a risk score:

| Level | Meaning |
| --- | --- |
| `direct` | Deterministic parser, manifest, or tool output directly establishes the relationship. |
| `inferred` | Multiple grounded signals support the relationship, but it is not directly established. |
| `heuristic` | A conservative pattern suggests the relationship and must not be presented as proof. |

Reports expose direct, inferred, and heuristic edge counts. Agent and MCP
consumers must preserve these labels and must not upgrade uncertain evidence to
verified proof.

## Validation And Determinism

The normalizer rejects:

- unsupported schema versions,
- duplicate adapter, node, or edge IDs,
- edges whose endpoints do not exist in the fragment,
- absolute or escaping repository paths,
- invalid line or column locations,
- unavailable adapters that emit nodes or edges.

Equivalent fragment sets produce stable adapter, node, edge, capability, and
limitation ordering. This keeps JSON artifacts reviewable and makes repeated
analysis suitable for deterministic comparisons.

## User-Facing Output

The normalized summary appears in:

- `codedecay analyze` JSON and Markdown,
- `codedecay redteam` JSON and Markdown,
- `codedecay agent` evidence,
- the MCP impact-map tool.

The summary includes the artifact path, node and edge counts, confidence counts,
adapter provenance, capabilities, and limitations. The full normalized graph is
stored locally at `.codedecay/local/impact-graph.json`.

CodeDecay does not execute the graph. Adapter evidence is descriptive data and
cannot authorize commands or model calls.
