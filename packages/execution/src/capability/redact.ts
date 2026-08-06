const REDACTED = "[redacted]";

/**
 * Strip secret-looking values from text before it enters logs, reports,
 * audit events, or agent-facing artifacts.
 */
export function redactSecretsFromText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(Authorization:\s*)\S+/gi, `$1${REDACTED}`)
    .replace(
      /\b(token|access_token|refresh_token|api[_-]?key|client_secret|secret|password|passwd|session|cookie|private[_-]?key)\s*[:=]\s*([^\s"',;]+)/gi,
      `$1=${REDACTED}`
    )
    .replace(
      /\b(token|access_token|refresh_token|api[_-]?key|client_secret|secret|password|passwd|session|cookie|private[_-]?key)=([^&\s]+)/gi,
      `$1=${REDACTED}`
    )
    .replace(/\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, REDACTED)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]");
}

export function redactSecretsFromUnknown(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return redactSecretsFromText(value);
}
