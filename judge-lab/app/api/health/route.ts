import { NextResponse } from "next/server";
import { CODEDECAY_VERSION } from "../../../lib/engine";
import { sourceCommit } from "../../../lib/source";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "codedecay-judge-lab",
      engineVersion: CODEDECAY_VERSION,
      sourceCommit: sourceCommit(),
      evidenceModes: ["live", "precomputed"],
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
