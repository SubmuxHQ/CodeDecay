# Impact Graph Adapter Contract

CodeDecay normalizes language and framework evidence into one versioned impact
graph. The graph lets reports and user-owned coding agents explain which
downstream files, routes, tests, and product surfaces may be affected, which
adapter supplied each relationship, and how certain that relationship is.

This contract is orchestration infrastructure. It does not replace the existing
JavaScript/TypeScript symbol graph or change risk scoring.

## Current Adapters

The JavaScript/TypeScript adapter bridges CodeDecay's existing Babel-backed
symbol graph:

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

The Remix file-route adapter maps Remix route modules into UI route evidence:

```text
adapter: codedecay-remix-file-routes
source tool: remix-route-conventions
artifact: .codedecay/local/impact-graph.json
```

It emits UI file nodes, route nodes, and `serves` edges for files under
`app/routes` or `src/app/routes`. Loader exports map to `GET`, action exports
map to `POST`, and dynamic `$param` route segments map to `:param` labels.
The adapter does not execute Remix, read a generated manifest, or treat custom
route configuration as proven behavior.

The Python adapter uses the open-source Lezer Python grammar:

```text
adapter: codedecay-python-lezer
source tool: @lezer/python
source tool version: 1.1.19
artifact: .codedecay/local/impact-graph.json
```

It emits Python file, API, route, test, and symbol nodes plus `contains`,
`imports`, `tests`, and `serves` edges. It detects exported functions/classes,
static imports, literal route decorators such as `@router.post("/path")`, and
tests that statically import changed symbols. Static test imports remain
limited evidence: they do not prove execution, assertions, database paths, or
real API behavior.

An unavailable optional adapter must report its capabilities and limitations
without installing anything or running commands, network requests, telemetry,
or model calls.

## OSS-First Selection

Adapter choices are intentionally replaceable:

- `@lezer/python` was selected for the first Python adapter because it is an
  in-process OSS grammar with no subprocess, hidden install, network, model
  call, or Python runtime requirement.
- Python `ast` was deferred because invoking it would require a Python
  subprocess boundary and execution policy design.
- Tree-sitter-based adapters remain a good future direction, but the first
  implementation avoids native-install and packaging complexity.
- Remix file-route conventions were selected before route-manifest execution
  because they provide deterministic framework evidence without running a
  build, server, or user project command.

Adapters should continue to prefer existing OSS parsers, manifests, or tool
outputs over weaker custom engines. Custom CodeDecay logic should normalize
that evidence, preserve provenance, and explain limitations.

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
