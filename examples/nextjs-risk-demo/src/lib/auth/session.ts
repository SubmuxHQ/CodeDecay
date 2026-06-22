export interface Session {
  userId: string;
  role: "USER" | "ADMIN";
}

export async function requireSession(token: string | null): Promise<Session | null> {
  if (!token) {
    return null;
  }

  return {
    userId: token,
    role: "USER"
  };
}

export function canViewAdmin(session: Session | null): boolean {
  return session?.role === "ADMIN";
}
