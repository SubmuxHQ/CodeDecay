# Security Policy

CodeDecay runs locally against source code and git history. It should not send
repository contents, file paths, diffs, or findings to any remote service.

## Reporting Vulnerabilities

Please report security issues privately to the maintainers before opening a
public issue.

Include:

- affected version or commit
- reproduction steps
- expected and actual behavior
- potential impact

## Security Principles

- No telemetry.
- No required API keys.
- No required LLM or model calls.
- No cloud-only behavior.
- Prefer deterministic local analysis.
- Treat repository contents as private by default.
