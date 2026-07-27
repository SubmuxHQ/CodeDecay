# Requirement Traceability

CodeDecay can map structured acceptance criteria to changed implementation and
verification evidence. Supply the same JSON, YAML, or Markdown requirements
artifact to each workflow:

```bash
codedecay analyze --task "Update users API" --requirements requirements.yml
codedecay redteam --with-checks --task "Update users API" --requirements requirements.yml
codedecay agent --task "Update users API" --requirements requirements.yml
codedecay loop --task "Update users API" --requirements requirements.yml
```

JSON retains the full trace graph. Markdown renders a concise acceptance
criteria matrix. Stable criterion IDs are preserved across analysis, redteam,
agent handoff, and loop revalidation.

## Status policy

- `unmapped`: no changed implementation candidate matched the criterion.
- `implementation-found`: implementation matched, but no proof was required or
  attached.
- `proof-missing`: implementation matched, but required trusted proof did not.
- `proof-failed`: trusted differential, product, test, or tool evidence failed.
- `verified`: mapped implementation has trusted passing evidence.
- `needs-human`: an untrusted agent proposal still needs post-change evidence.

Absence of evidence never becomes `verified`. Agent suggestions and edits remain
untrusted until a later deterministic or tool-backed run confirms them.

## Optional CI gate

Use `--fail-on-requirements` with `analyze` or `redteam` to exit non-zero when
any supplied acceptance criterion is not verified:

```bash
codedecay redteam \
  --with-checks \
  --task "Update users API" \
  --requirements requirements.yml \
  --fail-on-requirements
```

The gate is opt-in. CodeDecay does not mutate requirements, call a model, send
telemetry, or add a hosted dependency while building the trace.
