import type {
  CodeDecayCapabilityAllowRule,
  CodeDecayCapabilityKind,
  CodeDecayCapabilityPolicy,
  CodeDecayCapabilitySandboxMode
} from "../types";
import { CODEDECAY_CAPABILITY_KINDS, CODEDECAY_CAPABILITY_POLICY_VERSION } from "../types/capability-policy";
import { isPlainObject, normalizeNonEmptyString, normalizeStringList } from "./primitives";

const CAPABILITY_KIND_SET = new Set<string>(CODEDECAY_CAPABILITY_KINDS);
const SANDBOX_MODES = new Set<CodeDecayCapabilitySandboxMode>(["off", "best-effort", "required"]);

export function createDefaultCapabilityPolicy(): CodeDecayCapabilityPolicy {
  return {
    version: CODEDECAY_CAPABILITY_POLICY_VERSION,
    allow: [],
    sandbox: "best-effort"
  };
}

export function normalizeCapabilityPolicy(value: unknown, sourcePath: string): CodeDecayCapabilityPolicy {
  if (value === undefined) {
    return createDefaultCapabilityPolicy();
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: safety.capabilityPolicy must be an object.`);
  }

  const version =
    value.version === undefined
      ? CODEDECAY_CAPABILITY_POLICY_VERSION
      : normalizeCapabilityPolicyVersion(value.version, sourcePath);

  const allow =
    value.allow === undefined
      ? []
      : normalizeCapabilityAllowRules(value.allow, `${sourcePath}.allow`);

  const sandbox =
    value.sandbox === undefined
      ? "best-effort"
      : normalizeSandboxMode(value.sandbox, `${sourcePath}.sandbox`);

  return {
    version,
    allow,
    sandbox
  };
}

export function cloneCapabilityPolicy(policy: CodeDecayCapabilityPolicy): CodeDecayCapabilityPolicy {
  return {
    version: policy.version,
    allow: policy.allow.map((rule) => cloneCapabilityAllowRule(rule)),
    sandbox: policy.sandbox
  };
}

function normalizeCapabilityPolicyVersion(value: unknown, sourcePath: string): typeof CODEDECAY_CAPABILITY_POLICY_VERSION {
  if (value === CODEDECAY_CAPABILITY_POLICY_VERSION) {
    return CODEDECAY_CAPABILITY_POLICY_VERSION;
  }

  throw new Error(
    `Invalid CodeDecay config at ${sourcePath}: safety.capabilityPolicy.version must be ${CODEDECAY_CAPABILITY_POLICY_VERSION}.`
  );
}

function normalizeSandboxMode(value: unknown, field: string): CodeDecayCapabilitySandboxMode {
  const text = normalizeNonEmptyString(value, field, field);
  if (!SANDBOX_MODES.has(text as CodeDecayCapabilitySandboxMode)) {
    throw new Error(`Invalid CodeDecay config at ${field}: sandbox must be one of off, best-effort, required.`);
  }
  return text as CodeDecayCapabilitySandboxMode;
}

function normalizeCapabilityAllowRules(value: unknown, field: string): CodeDecayCapabilityAllowRule[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid CodeDecay config at ${field}: must be an array.`);
  }

  return value.map((item, index) => normalizeCapabilityAllowRule(item, `${field}[${index}]`));
}

function normalizeCapabilityAllowRule(value: unknown, field: string): CodeDecayCapabilityAllowRule {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${field}: must be an object.`);
  }

  const capability = normalizeCapabilityKind(value.capability, `${field}.capability`);
  const rule: CodeDecayCapabilityAllowRule = { capability };

  if (value.paths !== undefined) {
    rule.paths = normalizeStringList(value.paths, `${field}.paths`, field);
  }

  if (value.commands !== undefined) {
    rule.commands = normalizeStringList(value.commands, `${field}.commands`, field);
  }

  if (value.secrets !== undefined) {
    rule.secrets = normalizeStringList(value.secrets, `${field}.secrets`, field);
  }

  if (value.hosts !== undefined) {
    rule.hosts = normalizeStringList(value.hosts, `${field}.hosts`, field).map((host) =>
      normalizeNonEmptyString(host, `${field}.hosts`, field).toLowerCase()
    );
  }

  return rule;
}

function normalizeCapabilityKind(value: unknown, field: string): CodeDecayCapabilityKind {
  const text = normalizeNonEmptyString(value, field, field);
  if (!CAPABILITY_KIND_SET.has(text)) {
    throw new Error(
      `Invalid CodeDecay config at ${field}: capability must be one of ${CODEDECAY_CAPABILITY_KINDS.join(", ")}.`
    );
  }

  return text as CodeDecayCapabilityKind;
}

function cloneCapabilityAllowRule(rule: CodeDecayCapabilityAllowRule): CodeDecayCapabilityAllowRule {
  return {
    capability: rule.capability,
    paths: rule.paths ? [...rule.paths] : undefined,
    commands: rule.commands ? [...rule.commands] : undefined,
    secrets: rule.secrets ? [...rule.secrets] : undefined,
    hosts: rule.hosts ? [...rule.hosts] : undefined
  };
}
