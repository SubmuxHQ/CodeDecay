import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth/session";

export async function GET(request: Request) {
  const session = await requireSession(request.headers.get("authorization"));

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    users: []
  });
}
