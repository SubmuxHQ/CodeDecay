# Task-Scoped Context

`codedecay context` retrieves a bounded, inspectable packet of engineering
context for one task. Use it when a user-owned coding agent needs the relevant
routes, files, tests, requirements, memory, docs, owners, and proof references
without receiving a whole-repository dump.

```bash
npx codedecay context \
  --task "Allow finance admins to retry failed payouts" \
  --format markdown
```

The command refreshes local analysis artifacts, reads repo-local context, ranks
nodes with deterministic lexical and graph-neighbor matching, writes
`.codedecay/local/task-context.json`, and prints Markdown or JSON.

## What It Reads

Context retrieval uses existing CodeDecay evidence as source-of-truth input:

- requirements from `--task` and optional `--requirements`
- changed files, impacted areas, route/API impacts, symbol impacts, and test
  proof from the current analysis report
- normalized impact graph artifacts from `.codedecay/local/impact-graph.json`
- local `.codedecay/memory.json`
- `.codedecay/config.yml` design contracts, product endpoints, commands, and
  probes
- repository docs and ADR/RFC-style markdown
- CODEOWNERS entries
- package manifests
- latest local product/runtime verification evidence when analysis includes it

It does not execute configured checks, call models, generate embeddings, use
network access, or send telemetry.

## Output Shape

JSON output includes:

- `query`: task text, deterministic tokens, source revision, and node limit
- `graph.nodes`: selected context nodes with stable IDs, kind, trust class,
  confidence, provenance, limitations, and source revision
- `graph.edges`: selected evidence links such as `serves`, `tests`,
  `depends-on`, `owns`, and `observed-by`
- `selected`: ranked relevance explanations and evidence references
- `rejected`: near-miss decoys that scored below the selected bound
- `safety`: proof that no model, command, network, telemetry, or hosted service
  path was used

Trust classes distinguish current facts from context:

- `current-revision-fact`: current code, config, analysis, or runtime/tool
  evidence
- `memory`: repo-local memory that is useful but not proof
- `historical-context`: docs, ADRs, and similar context that may inform review
- `stale-context`: deprecated, superseded, outdated, or conflicting context
- `ai-suggestion`: untrusted agent text when present in upstream evidence

Memory and docs can guide investigation, but they cannot prove current behavior
or merge safety without corroborating current-revision evidence.

## Examples

Retrieve context before editing:

```bash
npx codedecay context \
  --task "Add a dashboard filter for reviewed uploads" \
  --max-nodes 16 \
  --format markdown
```

Retrieve context for an active PR diff:

```bash
npx codedecay context \
  --task "Change payout retry formatting" \
  --base main \
  --head HEAD \
  --format json
```

Use structured acceptance criteria:

```bash
npx codedecay context \
  --task "Add billing export" \
  --requirements .codedecay/requirements.yml \
  --format markdown
```

## MCP

The MCP server exposes the same retrieval boundary as `task_context`.

Example input:

```json
{
  "task": "Allow finance admins to retry failed payouts",
  "requirements": {
    "acceptanceCriteria": [
      {
        "id": "AC-1",
        "text": "A retry request enqueues exactly one worker job.",
        "requiredProof": ["API integration test", "worker idempotency test"]
      }
    ]
  },
  "format": "json",
  "maxNodes": 16
}
```

The tool is report-only. It writes the same local artifact and uses the same
trust, provenance, and limitation fields as the CLI.
