import { isIP } from "node:net";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";

export interface NetworkDestinationPolicy {
  /** Allowed hostnames (case-insensitive). Exact match only in this slice. */
  allowedHosts: string[];
  /** Allowed protocols. Defaults to http: and https:. */
  allowedProtocols?: string[] | undefined;
  /**
   * When true, reject hostnames that resolve to private/link-local addresses
   * unless the allowlisted hostname is itself that literal address.
   */
  blockUnexpectedPrivateResolution?: boolean | undefined;
}

export interface NetworkDestinationCheck {
  allowed: boolean;
  reason: string;
  url?: string | undefined;
  hostname?: string | undefined;
  resolvedAddresses?: string[] | undefined;
}

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google",
  "instance-data"
]);

const BLOCKED_LITERAL_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

/**
 * Validate a network destination before connect or after a redirect hop.
 * Blocks credentials-in-URL, unsupported schemes, disallowed hosts, and
 * common cloud metadata endpoints.
 */
export function validateNetworkDestination(
  rawUrl: string,
  policy: NetworkDestinationPolicy
): NetworkDestinationCheck {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      allowed: false,
      reason: "network URL is not valid"
    };
  }

  const allowedProtocols = policy.allowedProtocols ?? ["http:", "https:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      allowed: false,
      reason: `network protocol '${parsed.protocol}' is not allowed`,
      url: stripCredentials(parsed)
    };
  }

  if (parsed.username || parsed.password) {
    return {
      allowed: false,
      reason: "network URL must not include credentials",
      url: stripCredentials(parsed)
    };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname.length === 0 || BLOCKED_LITERAL_HOSTS.has(hostname)) {
    return {
      allowed: false,
      reason: "network hostname is not allowed",
      hostname
    };
  }

  if (METADATA_HOSTS.has(hostname) || hostname.endsWith(".metadata.google.internal")) {
    return {
      allowed: false,
      reason: "cloud metadata endpoints are blocked",
      hostname,
      url: stripCredentials(parsed)
    };
  }

  if (isBlockedMetadataIp(hostname)) {
    return {
      allowed: false,
      reason: "cloud metadata IP addresses are blocked",
      hostname,
      url: stripCredentials(parsed)
    };
  }

  const allowedHosts = new Set(policy.allowedHosts.map((host) => host.toLowerCase()));
  if (allowedHosts.size === 0) {
    return {
      allowed: false,
      reason: "network has no allowed hosts in policy",
      hostname,
      url: stripCredentials(parsed)
    };
  }

  if (!allowedHosts.has(hostname)) {
    return {
      allowed: false,
      reason: `network host '${hostname}' is not allowlisted`,
      hostname,
      url: stripCredentials(parsed)
    };
  }

  return {
    allowed: true,
    reason: "network destination is allowlisted",
    hostname,
    url: stripCredentials(parsed)
  };
}

/**
 * Resolve DNS and reject unexpected private/metadata resolutions (SSRF aid).
 * Explicit allowlisted loopback/private literals remain allowed.
 */
export async function validateResolvedNetworkDestination(
  rawUrl: string,
  policy: NetworkDestinationPolicy
): Promise<NetworkDestinationCheck> {
  const initial = validateNetworkDestination(rawUrl, policy);
  if (!initial.allowed || !initial.hostname) {
    return initial;
  }

  if (policy.blockUnexpectedPrivateResolution === false) {
    return initial;
  }

  if (isIP(initial.hostname) !== 0) {
    return initial;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(initial.hostname, { all: true, verbatim: true });
  } catch (error: unknown) {
    return {
      allowed: false,
      reason: `network host could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
      hostname: initial.hostname,
      url: initial.url
    };
  }

  const resolved = addresses.map((entry) => entry.address);
  for (const address of resolved) {
    if (isBlockedMetadataIp(address)) {
      return {
        allowed: false,
        reason: `network host resolves to blocked metadata address '${address}'`,
        hostname: initial.hostname,
        url: initial.url,
        resolvedAddresses: resolved
      };
    }

    if (isPrivateOrLinkLocalAddress(address)) {
      return {
        allowed: false,
        reason: `network host resolves to unexpected private address '${address}'`,
        hostname: initial.hostname,
        url: initial.url,
        resolvedAddresses: resolved
      };
    }
  }

  return {
    ...initial,
    resolvedAddresses: resolved
  };
}

/**
 * Fetch without auto-following redirects. Each Location hop must independently
 * pass the allowlist (UAT-SECURITY-4: local target redirecting externally is blocked).
 */
export async function fetchWithoutExternalRedirect(
  rawUrl: string,
  policy: NetworkDestinationPolicy,
  init?: RequestInit
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop < 5; hop += 1) {
    const check = validateNetworkDestination(current, policy);
    if (!check.allowed) {
      throw new Error(`Network request blocked by capability policy: ${check.reason}`);
    }

    const response = await fetch(current, {
      ...init,
      redirect: "manual"
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    current = new URL(location, current).toString();
  }

  throw new Error("Network request blocked by capability policy: too many redirects");
}

function stripCredentials(url: URL): string {
  const copy = new URL(url.toString());
  copy.username = "";
  copy.password = "";
  return copy.toString();
}

function isBlockedMetadataIp(value: string): boolean {
  return value === "169.254.169.254" || value === "fd00:ec2::254";
}

function isPrivateOrLinkLocalAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
      return true;
    }
    const [a = 0, b = 0] = parts;
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    return false;
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}
