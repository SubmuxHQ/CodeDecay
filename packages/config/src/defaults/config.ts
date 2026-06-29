import type { CodeDecayConfig } from "../types";

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
    allowCommands: false
  },
  llm: {
    provider: "disabled",
    timeoutMs: 30_000
  },
  toolAdapters: {},
  productTesting: {
    targets: {}
  },
  plugins: {
    enabled: []
  }
};
