export function authRepoUrl(fullName: string, token: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${fullName}.git`;
}

export function redact(value: string, token: string): string {
  return value.split(token).join("[redacted]").split(encodeURIComponent(token)).join("[redacted]");
}
