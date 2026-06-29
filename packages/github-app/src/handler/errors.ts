export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/x-access-token:[^@\s]+@github\.com/g, "x-access-token:[redacted]@github.com");
}
