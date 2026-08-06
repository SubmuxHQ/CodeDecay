import { getCapabilityApproval, validateCapabilityApproval, consumeCapabilityApproval } from "./approvals";
import { checkPathWithinAllowedRoots } from "./paths";
import { detectShellSubstitution } from "./shell";
import { enforceSandboxPolicy } from "./sandbox";
import { validateNetworkDestination } from "./network";
import type {
  CapabilityAllowRule,
  CapabilityAuthorization,
  CapabilityKind,
  CapabilityRequest
} from "./types";

const UNTRUSTED_INTENT_SOURCES = new Set([
  "agent",
  "memory",
  "mcp",
  "generated-experiment",
  "model"
]);

const PATH_SCOPED_CAPABILITIES = new Set<CapabilityKind>(["fs.read", "fs.write", "artifact.persist"]);

/**
 * Authorize a capability request.
 *
 * Untrusted intent sources can never elevate. command.execute additionally
 * requires trusted allowCommands intent. Other elevated capabilities require
 * an explicit policy.allow rule from loaded user config.
 * Optional session approvals must match exact scope and remain unexpired.
 */
export function authorizeCapability(request: CapabilityRequest): CapabilityAuthorization {
  const { capability, intent, policy } = request;

  if (UNTRUSTED_INTENT_SOURCES.has(intent.source)) {
    return deny(request, `untrusted intent source '${intent.source}' cannot grant capabilities`);
  }

  if (intent.source !== "user-config" && intent.source !== "cli-flag") {
    return deny(request, `intent source '${intent.source}' is not authorized to grant capabilities`);
  }

  if (request.command !== undefined) {
    const substitution = detectShellSubstitution(request.command);
    if (substitution) {
      return deny(request, `command rejected: ${substitution}`);
    }
  }

  const sandbox = enforceSandboxPolicy(policy.sandbox ?? "best-effort");
  if (!sandbox.allowed && (capability === "command.execute" || capability === "process.start" || capability === "package.install")) {
    return deny(request, sandbox.reason);
  }

  if (request.approval) {
    const approval = getCapabilityApproval(request.approval.sessionId, request.approval.approvalId);
    if (!approval) {
      return deny(request, "capability approval not found for session");
    }
    const approvalCheck = validateCapabilityApproval(approval, {
      capability: request.capability,
      command: request.command,
      paths: request.paths,
      hosts: request.hosts,
      secrets: request.secrets,
      toolName: request.approval.toolName,
      now: request.approval.now
    });
    if (!approvalCheck.allowed) {
      return deny(request, approvalCheck.reason);
    }
  }

  if (capability === "command.execute") {
    const decision = authorizeCommandExecute(request);
    if (decision.allowed && request.approval) {
      consumeCapabilityApproval(request.approval.sessionId, request.approval.approvalId, request.approval.now);
    }
    return decision;
  }

  const matchingRules = policy.allow.filter((rule) => rule.capability === capability);
  if (matchingRules.length === 0) {
    return deny(request, `capability '${capability}' is denied by default policy`);
  }

  if (PATH_SCOPED_CAPABILITIES.has(capability)) {
    const decision = authorizePathScoped(request, matchingRules);
    if (decision.allowed && request.approval) {
      consumeCapabilityApproval(request.approval.sessionId, request.approval.approvalId, request.approval.now);
    }
    return decision;
  }

  if (capability === "secret.env") {
    const decision = authorizeSecrets(request, matchingRules);
    if (decision.allowed && request.approval) {
      consumeCapabilityApproval(request.approval.sessionId, request.approval.approvalId, request.approval.now);
    }
    return decision;
  }

  if (capability === "network") {
    const decision = authorizeHosts(request, matchingRules);
    if (decision.allowed && request.approval) {
      consumeCapabilityApproval(request.approval.sessionId, request.approval.approvalId, request.approval.now);
    }
    return decision;
  }

  if (request.approval) {
    consumeCapabilityApproval(request.approval.sessionId, request.approval.approvalId, request.approval.now);
  }
  return allow(request, `capability '${capability}' granted by policy`);
}

function authorizeCommandExecute(request: CapabilityRequest): CapabilityAuthorization {
  if (!request.intent.allowCommands) {
    return deny(request, "command.execute requires safety.allowCommands user intent");
  }

  if (request.command === undefined || request.command.trim().length === 0) {
    return deny(request, "command.execute requires an explicit command");
  }

  const commandRules = request.policy.allow.filter((rule) => rule.capability === "command.execute");
  if (commandRules.length > 0) {
    const allowedByRule = commandRules.some((rule) => matchesCommandRule(request.command!, rule));
    if (!allowedByRule) {
      return deny(request, "command.execute is not listed in capabilityPolicy.allow commands");
    }
  }

  return allow(request, "command.execute granted by user-config allowCommands intent");
}

function authorizePathScoped(
  request: CapabilityRequest,
  matchingRules: CapabilityAllowRule[]
): CapabilityAuthorization {
  const paths = request.paths ?? [];
  if (paths.length === 0) {
    return deny(request, `${request.capability} requires explicit paths`);
  }

  const allowedRoots = collectAllowedRoots(request, matchingRules);
  if (allowedRoots.length === 0) {
    return deny(request, `${request.capability} has no allowed path roots`);
  }

  const cwd = request.cwd ?? process.cwd();
  for (const path of paths) {
    const check = checkPathWithinAllowedRoots(path, allowedRoots, cwd);
    if (!check.allowed) {
      return deny(request, `${request.capability} path denied: ${check.reason}`);
    }
  }

  return allow(request, `${request.capability} paths are within allowed roots`);
}

function authorizeSecrets(
  request: CapabilityRequest,
  matchingRules: CapabilityAllowRule[]
): CapabilityAuthorization {
  const secrets = request.secrets ?? [];
  if (secrets.length === 0) {
    return deny(request, "secret.env requires explicit secret names");
  }

  const allowed = new Set(
    matchingRules.flatMap((rule) => (rule.secrets ?? []).map((name) => name.toUpperCase()))
  );

  if (allowed.size === 0) {
    return deny(request, "secret.env has no allowed secret names in policy");
  }

  for (const secret of secrets) {
    if (!allowed.has(secret.toUpperCase())) {
      return deny(request, `secret.env '${secret}' is not allowlisted`);
    }
  }

  return allow(request, "secret.env names are allowlisted");
}

function authorizeHosts(
  request: CapabilityRequest,
  matchingRules: CapabilityAllowRule[]
): CapabilityAuthorization {
  const hosts = request.hosts ?? [];
  if (hosts.length === 0) {
    return deny(request, "network requires explicit hosts");
  }

  const allowed = matchingRules.flatMap((rule) => (rule.hosts ?? []).map((host) => host.toLowerCase()));
  if (allowed.length === 0) {
    return deny(request, "network has no allowed hosts in policy");
  }

  for (const host of hosts) {
    const candidate = host.includes("://") ? host : `https://${host}`;
    const check = validateNetworkDestination(candidate, { allowedHosts: allowed });
    if (!check.allowed) {
      return deny(request, check.reason);
    }
  }

  return allow(request, "network hosts are allowlisted");
}

function collectAllowedRoots(request: CapabilityRequest, matchingRules: CapabilityAllowRule[]): string[] {
  const fromRules = matchingRules.flatMap((rule) => rule.paths ?? []);
  const fromRequest = request.allowedRoots ?? [];
  return [...fromRules, ...fromRequest];
}

function matchesCommandRule(command: string, rule: CapabilityAllowRule): boolean {
  if (!rule.commands || rule.commands.length === 0) {
    return true;
  }

  const trimmed = command.trim();
  return rule.commands.some((allowed) => trimmed === allowed || trimmed.startsWith(`${allowed} `));
}

function allow(request: CapabilityRequest, reason: string): CapabilityAuthorization {
  return {
    allowed: true,
    reason,
    capability: request.capability,
    intentSource: request.intent.source
  };
}

function deny(request: CapabilityRequest, reason: string): CapabilityAuthorization {
  return {
    allowed: false,
    reason,
    capability: request.capability,
    intentSource: request.intent.source
  };
}
