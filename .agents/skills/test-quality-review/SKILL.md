---
name: test-quality-review
description: Use when a pull request adds or changes tests, or when CodeDecay reports missing tests, to identify weak tests that do not prove real behavior.
---

# Test Quality Review Skill

Use this skill when a PR adds or changes tests, or when CodeDecay reports missing
tests.

## Goal

Detect tests that look useful but do not prove the real behavior.

## Review Checklist

- Does the test exercise the real exported function, CLI command, route, action,
  or user path?
- Does it only copy implementation logic into the assertion?
- Does it mock the exact dependency where the bug would happen?
- Does it check failure paths, edge cases, and invalid inputs?
- Does it assert meaningful behavior, not just snapshots or existence?
- Would the test fail if the production behavior broke?
- For CLI behavior, does at least one test run the built dist CLI when release
  risk is involved?
- For GitHub Action/App behavior, are YAML/webhook inputs and output paths
  covered?

## Common Weak Signals

- no assertions
- snapshot-only assertions
- excessive mocks
- happy-path-only fixtures
- test names that describe behavior the assertions do not check
- tests unrelated to changed source files
- tests that assert implementation details but not user-visible outcomes

## Output

Report each weak test with:

- file path,
- why it is weak,
- what real behavior is unproven,
- the smallest stronger test to add.
