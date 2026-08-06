export { authorizeCapability } from "./authorize";
export {
  appendCapabilityAuditEvent,
  resolveCapabilityAuditPath,
  CAPABILITY_AUDIT_RELATIVE_PATH
} from "./audit";
export {
  assertMcpConfirmationScope,
  approvalFingerprint,
  clearCapabilityApprovalSession,
  consumeCapabilityApproval,
  createCapabilityApproval,
  getCapabilityApproval,
  resetCapabilityApprovalSessionsForTests,
  validateCapabilityApproval
} from "./approvals";
export type { CapabilityApproval, CapabilityApprovalScope, CreateCapabilityApprovalInput } from "./approvals";
export { assertTrustedCapabilityEvidence, isTrustedCapabilityEvidenceSource } from "./evidence";
export { checkPathWithinAllowedRoots } from "./paths";
export { detectShellSubstitution } from "./shell";
export { evaluateProcessIsolation, enforceSandboxPolicy } from "./sandbox";
export type { ProcessIsolationEvaluation, SandboxEnforcement, SandboxMode } from "./sandbox";
export { redactSecretsFromText, redactSecretsFromUnknown } from "./redact";
export {
  fetchWithoutExternalRedirect,
  validateNetworkDestination,
  validateResolvedNetworkDestination
} from "./network";
export {
  CAPABILITY_KINDS,
  CAPABILITY_POLICY_VERSION,
  createDefaultCapabilityPolicy
} from "./types";
export type {
  CapabilityAllowRule,
  CapabilityAuditEvent,
  CapabilityAuditPhase,
  CapabilityAuthorization,
  CapabilityIntent,
  CapabilityIntentSource,
  CapabilityKind,
  CapabilityPolicy,
  CapabilityRequest,
  CapabilitySandboxMode
} from "./types";
export type { NetworkDestinationCheck, NetworkDestinationPolicy } from "./network";
