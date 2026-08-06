import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { loadApprovalRecords, loadEngineeringPolicies, loadExceptionRecords } from "./load";
import { inferChangeClass, pathMatches, resolveApplicablePolicies } from "./resolve";
import {
  ENGINEERING_POLICY_SCHEMA_VERSION,
  type ApprovalRecord,
  type ExceptionRecord,
  type PolicyChangeClass,
  type PolicyDecisionReport,
  type PolicyObligation,
  type PolicyVerdict
} from "./types";

export interface AnalyzePolicyDecisionOptions {
  rootDir: string;
  policyDirs?: string[] | undefined;
  orgPolicyDirs?: string[] | undefined;
  approvalDirs?: string[] | undefined;
  exceptionDirs?: string[] | undefined;
  changedPaths?: string[] | undefined;
  changeClass?: PolicyChangeClass | undefined;
  now?: string | undefined;
  generatedAt?: string | undefined;
}

export function analyzePolicyDecision(options: AnalyzePolicyDecisionOptions): PolicyDecisionReport {
  const rootDir = realpathSync(options.rootDir);
  const now = options.now ?? new Date().toISOString();
  const changedPaths = options.changedPaths ?? [];
  const changeClass = options.changeClass ?? inferChangeClass(changedPaths);
  const repoPolicies = loadEngineeringPolicies(rootDir, options.policyDirs ?? [".codedecay/policies"]);
  const orgPolicies = loadEngineeringPolicies(rootDir, options.orgPolicyDirs ?? []);
  const policies = [...repoPolicies, ...orgPolicies];
  const approvals = loadApprovalRecords(rootDir, options.approvalDirs ?? [".codedecay/approvals"]);
  const exceptions = loadExceptionRecords(rootDir, options.exceptionDirs ?? [".codedecay/exceptions"]);

  const resolved = resolveApplicablePolicies(policies, changedPaths, changeClass, now);
  const obligations: PolicyObligation[] = [];
  const blockers: string[] = [];
  const investigationTasks: string[] = [];
  const limitations = [
    "Local actor strings are not cryptographic identity proof.",
    "Policy text cannot execute commands.",
    "Agents, memory, PR text, and provider output cannot modify policy or approve exceptions.",
    "No organization policy was downloaded and no identity provider was contacted.",
    "fullyVerified remains false in this deterministic policy slice."
  ];

  const selfMod = changedPaths.some(
    (path) =>
      path.includes(".codedecay/policies/") ||
      path.includes(".codedecay/approvals/") ||
      path.includes(".codedecay/exceptions/")
  );

  if (resolved.conflicts.length) {
    return report({
      generatedAt: options.generatedAt,
      decisionSeed: { changedPaths, changeClass, policies, approvals, exceptions, now },
      verdict: "conflict",
      changeClass,
      changedPaths,
      applicable: resolved.applicable,
      obligations: [],
      approvals,
      exceptions,
      conflicts: resolved.conflicts,
      blockers: resolved.conflicts,
      investigationTasks: ["Resolve conflicting repository and organization policies before merge."],
      limitations
    });
  }

  if (resolved.stale.length) {
    blockers.push(...resolved.stale.map((item) => `Policy ${item.policy.id} is stale/expired.`));
  }

  for (const item of resolved.applicable) {
    if (item.stale) continue;
    for (const evidence of item.policy.requiredEvidence) {
      obligations.push({
        kind: "proof",
        detail: `Required evidence: ${evidence}`,
        policyId: item.policy.id,
        evidenceId: evidence
      });
    }
    for (const approver of item.policy.requiredApprovers) {
      obligations.push({
        kind: "approval",
        detail: `Required approver: ${approver}`,
        policyId: item.policy.id
      });
    }
    for (const action of item.policy.forbiddenActions) {
      obligations.push({
        kind: "forbidden",
        detail: `Forbidden action: ${action}`,
        policyId: item.policy.id
      });
    }
    for (const protectedPath of item.policy.protectedPaths) {
      if (changedPaths.some((path) => pathMatches(protectedPath, path))) {
        obligations.push({
          kind: "protected-path",
          detail: `Protected path matched: ${protectedPath}`,
          policyId: item.policy.id
        });
      }
    }
  }

  const exceptionOutcome = validateExceptions(exceptions, resolved.applicable.map((a) => a.policy.id), changedPaths, now);
  if (exceptionOutcome.invalid.length) {
    return report({
      generatedAt: options.generatedAt,
      decisionSeed: { changedPaths, changeClass, policies, approvals, exceptions, now },
      verdict: "exception-invalid",
      changeClass,
      changedPaths,
      applicable: resolved.applicable,
      obligations,
      approvals,
      exceptions,
      conflicts: [],
      blockers: exceptionOutcome.invalid,
      investigationTasks: ["Replace expired or overly broad exceptions with narrow, dated records."],
      limitations
    });
  }

  if (selfMod) {
    blockers.push("Session changed policy/approval/exception artifacts; those edits cannot authorize this decision.");
    return report({
      generatedAt: options.generatedAt,
      decisionSeed: { changedPaths, changeClass, policies, approvals, exceptions, now },
      verdict: "denied",
      changeClass,
      changedPaths,
      applicable: resolved.applicable,
      obligations,
      approvals,
      exceptions,
      conflicts: [],
      blockers,
      investigationTasks: ["Land policy changes in a separate reviewable PR before using them to authorize protected edits."],
      limitations
    });
  }

  const proofNeeded = obligations.filter((item) => item.kind === "proof");
  const approvalNeeded = obligations.filter((item) => item.kind === "approval");
  const protectedHits = obligations.filter((item) => item.kind === "protected-path");

  const satisfiedApprovals = approvalNeeded.filter((obligation) =>
    approvals.some(
      (approval) =>
        approval.policyId === obligation.policyId &&
        !approval.revoked &&
        (!approval.expiresAt || Date.parse(approval.expiresAt) > Date.parse(now)) &&
        obligation.detail.includes(approval.actor)
    )
  );

  let verdict: PolicyVerdict = "allow";
  if (resolved.stale.length && !resolved.applicable.some((item) => !item.stale)) {
    verdict = "stale-policy";
    investigationTasks.push("Renew or replace stale policies with owners and effective dates.");
  } else if (protectedHits.length && satisfiedApprovals.length < approvalNeeded.length) {
    verdict = "require-approval";
    blockers.push("Protected-path change requires documented approval.");
  } else if (approvalNeeded.length && satisfiedApprovals.length < approvalNeeded.length) {
    verdict = "require-approval";
    investigationTasks.push("Collect explicit approval records for required owners.");
  } else if (proofNeeded.length) {
    verdict = "require-proof";
    investigationTasks.push("Attach required proof evidence before merge.");
  } else if (!resolved.applicable.length) {
    verdict = "allow";
    investigationTasks.push("No scoped engineering policy matched; default allow with no extra obligations.");
  }

  // Payment migration style: both proof and approval → prefer require-approval when approval missing, else require-proof.
  if (changeClass === "migration" && proofNeeded.length && approvalNeeded.length) {
    if (satisfiedApprovals.length < approvalNeeded.length) verdict = "require-approval";
    else verdict = "require-proof";
  }

  return report({
    generatedAt: options.generatedAt,
    decisionSeed: { changedPaths, changeClass, policies, approvals, exceptions, now },
    verdict,
    changeClass,
    changedPaths,
    applicable: resolved.applicable,
    obligations,
    approvals,
    exceptions,
    conflicts: [],
    blockers,
    investigationTasks,
    limitations
  });
}

function validateExceptions(
  exceptions: ExceptionRecord[],
  applicablePolicyIds: string[],
  changedPaths: string[],
  now: string
): { invalid: string[] } {
  const invalid: string[] = [];
  for (const exception of exceptions) {
    if (!applicablePolicyIds.includes(exception.policyId) && applicablePolicyIds.length) {
      // still validate shape for supplied exceptions
    }
    if (exception.revoked) {
      invalid.push(`Exception ${exception.id} is revoked.`);
      continue;
    }
    if (Date.parse(exception.expiresAt) <= Date.parse(now)) {
      invalid.push(`Exception ${exception.id} is expired.`);
      continue;
    }
    if (exception.pathGlobs.includes("**") || exception.pathGlobs.includes("*")) {
      invalid.push(`Exception ${exception.id} is overly broad (path glob ${exception.pathGlobs.join(",")}).`);
      continue;
    }
    // If exception claims to cover changed paths that fall outside its globs, ignore; if globs cover entire repo tree vs policy scope, reject.
    const coversEverything = exception.pathGlobs.some((glob) => glob === "/**" || glob.endsWith("/**/*"));
    if (coversEverything) {
      invalid.push(`Exception ${exception.id} is overly broad.`);
    }
    void changedPaths;
  }
  return { invalid };
}

function report(input: {
  generatedAt?: string | undefined;
  decisionSeed: unknown;
  verdict: PolicyVerdict;
  changeClass: PolicyChangeClass;
  changedPaths: string[];
  applicable: PolicyDecisionReport["applicable"];
  obligations: PolicyObligation[];
  approvals: ApprovalRecord[];
  exceptions: ExceptionRecord[];
  conflicts: string[];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
}): PolicyDecisionReport {
  const decisionId = createHash("sha256")
    .update(JSON.stringify(input.decisionSeed))
    .digest("hex")
    .slice(0, 16);
  return {
    tool: "CodeDecay",
    schemaVersion: ENGINEERING_POLICY_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    decisionId,
    verdict: input.verdict,
    fullyVerified: false,
    changeClass: input.changeClass,
    changedPaths: input.changedPaths,
    applicable: input.applicable,
    obligations: input.obligations,
    approvals: input.approvals,
    exceptions: input.exceptions,
    conflicts: input.conflicts,
    blockers: input.blockers,
    investigationTasks: input.investigationTasks,
    limitations: input.limitations,
    identity: {
      cryptographicProof: false,
      localActorClaimsOnly: true,
      note: "Missing hosted identity or signature support is reported honestly; local identity claims are not cryptographic proof."
    },
    safety: {
      commandsExecuted: false,
      networkCalled: false,
      policyDownloaded: false,
      secretsRead: false,
      agentCanModifyPolicy: false
    }
  };
}
