import { NextResponse } from "next/server";
import { isReviewState, isScenarioId } from "../../../lib/contracts";
import { runJudgeScenario } from "../../../lib/engine";

const MAX_BODY_BYTES = 512;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse("Request body is too large.", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Expected a JSON request body.", 400);
  }

  if (!isPlainObject(body)) {
    return errorResponse("Expected a JSON object.", 400);
  }

  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !keys.includes("scenarioId") ||
    !keys.includes("state") ||
    !isScenarioId(body.scenarioId) ||
    !isReviewState(body.state)
  ) {
    return errorResponse("Choose a known scenarioId and state.", 400);
  }

  return NextResponse.json(runJudgeScenario(body.scenarioId, body.state), {
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
