export const DEFAULT_INSTRUCTIONS = [
  "Use this bundle as local tool evidence for a PR safety pass.",
  "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings.",
  "Do not assume the PR is safe just because tests pass.",
  "Add or improve tests that exercise real API, UI, database, or downstream behavior.",
  "Run only commands explicitly configured by the user or requested in the repo workflow.",
  "After making changes, re-run CodeDecay and the relevant project checks."
];

export const DEFAULT_LIMITS = [
  "CodeDecay did not call an LLM/model to create this bundle.",
  "CodeDecay did not execute commands while creating this bundle.",
  "Agent suggestions are not trusted evidence unless verified by tests or tool output.",
  "This bundle reduces missed-review risk; it does not guarantee a safe merge."
];
