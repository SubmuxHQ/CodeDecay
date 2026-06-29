import type {
  CodeDecayCommands,
  CodeDecayConfig,
  CodeDecayPluginsConfig,
  CodeDecayProductTestingConfig,
  CodeDecayToolAdapters
} from "./types";

export function cloneConfig(config: CodeDecayConfig): CodeDecayConfig {
  return {
    version: config.version,
    commands: cloneCommands(config.commands),
    probes: config.probes.map((probe) => ({ ...probe })),
    safety: { ...config.safety },
    llm: { ...config.llm },
    toolAdapters: cloneToolAdapters(config.toolAdapters),
    productTesting: cloneProductTesting(config.productTesting),
    plugins: clonePlugins(config.plugins)
  };
}

export function cloneCommands(commands: CodeDecayCommands): CodeDecayCommands {
  return {
    test: [...commands.test],
    build: [...commands.build],
    start: [...commands.start]
  };
}

export function cloneToolAdapters(toolAdapters: CodeDecayToolAdapters): CodeDecayToolAdapters {
  const cloned: CodeDecayToolAdapters = {};

  if (toolAdapters.agentProcess) {
    cloned.agentProcess = { ...toolAdapters.agentProcess };
  }

  if (toolAdapters.playwright) {
    cloned.playwright = { ...toolAdapters.playwright };
  }

  if (toolAdapters.stryker) {
    cloned.stryker = { ...toolAdapters.stryker };
  }

  if (toolAdapters.schemathesis) {
    cloned.schemathesis = { ...toolAdapters.schemathesis };
  }

  if (toolAdapters.pact) {
    cloned.pact = { ...toolAdapters.pact };
  }

  if (toolAdapters.semgrep) {
    cloned.semgrep = { ...toolAdapters.semgrep };
  }

  if (toolAdapters.coverage) {
    cloned.coverage = {
      ...toolAdapters.coverage,
      reportPaths: toolAdapters.coverage.reportPaths ? [...toolAdapters.coverage.reportPaths] : undefined
    };
  }

  return cloned;
}

export function cloneProductTesting(productTesting: CodeDecayProductTestingConfig): CodeDecayProductTestingConfig {
  return {
    targets: Object.fromEntries(
      Object.entries(productTesting.targets).map(([id, target]) => [
        id,
        {
          ...target,
          apiEndpoints: target.apiEndpoints.map((endpoint) => ({
            ...endpoint,
            expectedStatuses: [...endpoint.expectedStatuses],
            headers: endpoint.headers ? { ...endpoint.headers } : undefined
          })),
          readiness: {
            ...target.readiness,
            commandsRequired: [...target.readiness.commandsRequired],
            notes: [...target.readiness.notes]
          }
        }
      ])
    )
  };
}

export function clonePlugins(plugins: CodeDecayPluginsConfig): CodeDecayPluginsConfig {
  return {
    enabled: [...plugins.enabled]
  };
}
