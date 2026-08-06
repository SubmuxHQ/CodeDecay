import type { CodeDecayConfig } from "../types";
import { CODEDECAY_CAPABILITY_POLICY_VERSION } from "../types/capability-policy";

export const DEFAULT_CODEDECAY_CONFIG: CodeDecayConfig = {
  version: 1,
  commands: {
    test: [],
    build: [],
    start: []
  },
  probes: [],
  safety: {
    commandTimeoutMs: 120_000,
    allowCommands: false,
    capabilityPolicy: {
      version: CODEDECAY_CAPABILITY_POLICY_VERSION,
      allow: [],
      sandbox: "best-effort"
    }
  },
  llm: {
    provider: "disabled",
    timeoutMs: 30_000
  },
  memoryProviders: {
    providers: [
      {
        provider: "local",
        enabled: true
      }
    ]
  },
  toolAdapters: {},
  productTesting: {
    targets: {}
  },
  apiContracts: {
    openapi: []
  },
  plugins: {
    enabled: []
  }
};
