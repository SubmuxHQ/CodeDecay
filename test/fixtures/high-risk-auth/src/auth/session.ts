export function validateSession(token: string | null) {
  if (!token) {
    return null;
  }

  return {
    token,
    role: "user"
  };
}
