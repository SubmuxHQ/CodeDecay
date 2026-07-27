import type { Metadata } from "next";
import { CODEDECAY_VERSION } from "../lib/engine";
import { SCENARIOS } from "../lib/scenarios";
import { sourceCommit } from "../lib/source";
import { JudgeLab } from "./judge-lab";

export const metadata: Metadata = {
  title: "Judge Lab | CodeDecay",
  description:
    "Run the CodeDecay deterministic PR safety engine against curated risky and clean PRs.",
};

export default function Home() {
  return (
    <JudgeLab
      engineVersion={CODEDECAY_VERSION}
      sourceCommit={sourceCommit()}
      scenarios={SCENARIOS}
    />
  );
}
