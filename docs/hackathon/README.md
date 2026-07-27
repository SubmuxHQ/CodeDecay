# Codex India Hackathon 2026

This directory is the public, reviewable source for CodeDecay's Building Evals
submission.

- [`submission-description.md`](./submission-description.md) contains the
  Google Docs-ready project description.
- [`originality-ledger.md`](./originality-ledger.md) separates the pre-existing
  open-source foundation from work completed with Codex during the hackathon.
- [`codedecay-submission.docx`](https://github.com/SubmuxHQ/CodeDecay/raw/main/docs/hackathon/codedecay-submission.docx)
  is the generated, visually verified import artifact for the final native
  Google Doc.

Regenerate the DOCX after editing either Markdown source:

```bash
python3 scripts/generate-hackathon-submission-docx.py
```

The generator requires `python-docx`. The checked-in artifact is also audited
for Google Docs title-rule residue, accessibility, and every rendered page
before release.

The deployed Judge Lab is available at
[codedecay-judge-lab.kunal277075.chatgpt.site](https://codedecay-judge-lab.kunal277075.chatgpt.site).
Release, video, Google Doc sharing, and final BlockseBlock verification remain
tracked by issues
[#698](https://github.com/SubmuxHQ/CodeDecay/issues/698),
[#696](https://github.com/SubmuxHQ/CodeDecay/issues/696), and
[#699](https://github.com/SubmuxHQ/CodeDecay/issues/699).

Quantitative claims in these documents are deliberately limited to the
versioned deterministic fixture corpus. They are not claims of production
accuracy or proof that CodeDecay always improves an agent's outcome.
