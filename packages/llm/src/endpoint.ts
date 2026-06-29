export function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  let endIndex = trimmed.length;

  while (endIndex > 0 && trimmed.charAt(endIndex - 1) === "/") {
    endIndex -= 1;
  }

  return trimmed.slice(0, endIndex);
}
