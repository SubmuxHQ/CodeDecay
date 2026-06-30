import type {
  CodeDecayCommands,
  CodeDecayConfig,
  CodeDecayMemoryProvidersConfig,
  CodeDecayPluginsConfig,
  CodeDecayProductTestingConfig,
  CodeDecayToolAdapters
} from "./types";
import { cloneMemoryProviders } from "./normalize/memory-providers";

export function cloneConfig(config: CodeDecayConfig): CodeDecayConfig {
  const cloned: CodeDecayConfig = {
    version: config.version,
    commands: cloneCommands(config.commands),
    probes: config.probes.map((probe) => ({ ...probe })),
    safety: { ...config.safety },
    llm: { ...config.llm },
    memoryProviders: cloneMemoryProviders(config.memoryProviders),
    toolAdapters: cloneToolAdapters(config.toolAdapters),
    productTesting: cloneProductTesting(config.productTesting),
    plugins: clonePlugins(config.plugins)
  };

  if (config.designContract) {
    cloned.designContract = cloneDesignContract(config.designContract);
  }

  return cloned;
}

export function cloneConfiguredMemoryProviders(
  memoryProviders: CodeDecayMemoryProvidersConfig
): CodeDecayMemoryProvidersConfig {
  return cloneMemoryProviders(memoryProviders);
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

function cloneDesignContract(contract: NonNullable<CodeDecayConfig["designContract"]>): NonNullable<CodeDecayConfig["designContract"]> {
  return {
    ...contract,
    scopeFences: contract.scopeFences?.map((rule) => cloneRule(rule)),
    boundaryRules: contract.boundaryRules?.map((rule) => ({
      ...rule,
      from: cloneRule(rule.from),
      disallow: rule.disallow ? cloneRule(rule.disallow) : undefined,
      allow: rule.allow ? cloneRule(rule.allow) : undefined
    })),
    dependencyRules: contract.dependencyRules?.map((rule) => cloneRule(rule)),
    bannedApis: contract.bannedApis?.map((rule) => cloneRule(rule)),
    patternRules: contract.patternRules?.map((rule) => cloneRule(rule))
  };
}

function cloneRule<T extends { files?: string[] | undefined; areas?: string[] | undefined; productPaths?: string[] | undefined }>(rule: T): T {
  return {
    ...rule,
    files: rule.files ? [...rule.files] : undefined,
    areas: rule.areas ? [...rule.areas] : undefined,
    productPaths: rule.productPaths ? [...rule.productPaths] : undefined,
    ...("allowedFiles" in rule && Array.isArray(rule.allowedFiles) ? { allowedFiles: [...rule.allowedFiles] } : {}),
    ...("allowedAreas" in rule && Array.isArray(rule.allowedAreas) ? { allowedAreas: [...rule.allowedAreas] } : {}),
    ...("allowedImports" in rule && Array.isArray(rule.allowedImports) ? { allowedImports: [...rule.allowedImports] } : {}),
    ...("bannedImports" in rule && Array.isArray(rule.bannedImports) ? { bannedImports: [...rule.bannedImports] } : {}),
    ...("apis" in rule && Array.isArray(rule.apis) ? { apis: [...rule.apis] } : {}),
    ...("required" in rule && Array.isArray(rule.required) ? { required: [...rule.required] } : {}),
    ...("forbidden" in rule && Array.isArray(rule.forbidden) ? { forbidden: [...rule.forbidden] } : {})
  };
}
