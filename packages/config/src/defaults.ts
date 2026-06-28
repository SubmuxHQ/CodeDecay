import type { CodeDecayConfig } from "./types";

export const CONFIG_CANDIDATES = [
  ".codedecay/config.yml",
  ".codedecay/config.yaml",
  "codedecay.config.yml",
  "codedecay.config.yaml"
];

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
  }
};

export const DEFAULT_PRODUCT_TARGET_TIMEOUT_MS = 60_000;
