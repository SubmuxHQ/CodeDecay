# Engineering policy

CodeDecay resolves **repository-local engineering policies** (and optional local
organization policy directories) into a deterministic decision for a change set.

## What it can establish

- Versioned policy docs with scope, owner, precedence, required evidence,
  required approvers, forbidden actions, and protected paths
- Deterministic applicability and conflict detection (fail closed)
- Explicit approval and exception fixture validation (expiry, breadth, revocation)
- Self-modification denial when the same session edits policy/approval artifacts
- Stable `decisionId` shared by CLI and MCP (and future Action/loop callers)

## What it cannot establish

- Cryptographic identity or hosted RBAC signatures
- Automatic exception renewal or learning
- A `fullyVerified: true` result (always false in this slice)
- Hidden organization policy download

## CLI / MCP

```bash
codedecay policy --policies .codedecay/policies --changed prisma/migrations/001/migration.sql
codedecay policy --policies .codedecay/policies --org-policies .codedecay/org-policies --approvals .codedecay/approvals --format json
```

MCP tool: `policy_decision`.

OSS keeps local policy-as-code in git. Hosted identity, signatures, and org admin
remain a separate future design.
