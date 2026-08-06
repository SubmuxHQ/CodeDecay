import type { ProductHealthResult } from "../../types";
import { fetchWithoutExternalRedirect } from "@submuxhq/codedecay-execution";
import { delay, elapsed } from "./timing";

export async function pollProductHealth(url: string, timeoutMs: number): Promise<ProductHealthResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;
  const allowedHosts = hostnameAllowlistForConfiguredUrl(url);

  while (Date.now() <= deadline) {
    attempts += 1;
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(2500, remainingMs));

    try {
      const response = await fetchWithoutExternalRedirect(
        url,
        { allowedHosts },
        { signal: controller.signal }
      );
      lastStatus = response.status;

      if (response.status >= 200 && response.status < 400) {
        clearTimeout(timeout);
        return {
          url,
          status: "passed",
          attempts,
          durationMs: elapsed(startedAt),
          httpStatus: response.status
        };
      }

      lastError = `Health check returned HTTP ${response.status}.`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }

    await delay(Math.min(500, Math.max(0, deadline - Date.now())));
  }

  return {
    url,
    status: "timed_out",
    attempts,
    durationMs: elapsed(startedAt),
    httpStatus: lastStatus,
    error: lastError ? `Timed out waiting for a healthy response: ${lastError}` : "Timed out waiting for a healthy response."
  };
}

function hostnameAllowlistForConfiguredUrl(url: string): string[] {
  try {
    return [new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase()];
  } catch {
    return [];
  }
}
