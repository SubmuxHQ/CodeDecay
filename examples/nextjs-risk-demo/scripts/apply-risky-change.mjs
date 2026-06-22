import { writeFileSync } from "node:fs";

function writeExampleFile(path, contents) {
  writeFileSync(new URL(`../${path}`, import.meta.url), contents, "utf8");
}

writeExampleFile(
  "next.config.js",
  `/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
`
);

writeExampleFile(
  "prisma/schema.prisma",
  `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id         String    @id @default(cuid())
  email      String    @unique
  role       String    @default("ADMIN")
  riskScore  Int       @default(0)
  lastSeenAt DateTime?
  createdAt  DateTime  @default(now())
}
`
);

writeExampleFile(
  "src/app/api/users/route.ts",
  `import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth/session";

export async function GET(request: Request) {
  const session = await requireSession(request.headers.get("authorization"));

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query: any = Object.fromEntries(new URL(request.url).searchParams);
  const includeDeleted = query.includeDeleted === "true";

  return NextResponse.json({
    users: [],
    includeDeleted,
    requestedBy: session.userId
  });
}
`
);

writeExampleFile(
  "src/app/dashboard/page.tsx",
  `export default function DashboardPage() {
  const cards = ["Revenue", "Users", "Incidents", "Admin"];

  return (
    <main>
      <h1>Dashboard</h1>
      <section>
        {cards.map((card) => (
          <article key={card}>{card}</article>
        ))}
      </section>
    </main>
  );
}
`
);

writeExampleFile(
  "src/lib/auth/session.ts",
  `export interface Session {
  userId: string;
  role: "USER" | "ADMIN";
}

export async function requireSession(token: string | null): Promise<Session | null> {
  try {
    if (!token) {
      return null;
    }

    return {
      userId: token,
      role: "USER"
    };
  } catch {
    return null; // ignore fallback
  }
}

export function canViewAdmin(session: Session | null): boolean {
  if (!session) {
    return false;
  }
  return true;
}
`
);

console.log("Applied the risky Next.js-style changes for CodeDecay analysis.");
