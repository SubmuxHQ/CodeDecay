import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import type { MemorySetupOptions, MemorySetupProvider } from "../types";

export interface MemorySetupProviderPlan {
  provider: Exclude<MemorySetupProvider, "all">;
  title: string;
  description: string;
  installCommand?: string | undefined;
  envVars: string[];
  configSnippet: string;
  notes: string[];
}

export interface MemorySetupResult {
  tool: "CodeDecay";
  version: string;
  rootDir: string;
  apply: boolean;
  writtenPath?: string | undefined;
  providers: MemorySetupProviderPlan[];
  safety: {
    dryRunDefault: true;
    packagesInstalled: false;
    networkCalled: false;
    configTouched: false;
    trackedConfigWritten: false;
  };
}

export function createMemorySetupResult(rootDir: string, options: MemorySetupOptions): MemorySetupResult {
  const providers = expandProvider(options.provider).map(createProviderPlan);
  const result: MemorySetupResult = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    rootDir,
    apply: options.apply,
    providers,
    safety: {
      dryRunDefault: true,
      packagesInstalled: false,
      networkCalled: false,
      configTouched: false,
      trackedConfigWritten: false
    }
  };

  if (options.apply) {
    result.writtenPath = writeMemorySetupPreview(rootDir, providers);
  }

  return result;
}

export function renderMemorySetupResult(result: MemorySetupResult, format: "json" | "markdown"): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay Memory Setup",
    "",
    `**Repository:** \`${result.rootDir}\``,
    `**Applied:** ${result.apply ? "yes" : "no"}`,
    result.writtenPath ? `**Written to:** \`${result.writtenPath}\`` : "**Written to:** preview only",
    "",
    "This command does not install packages, call memory providers, send telemetry, call models, or edit tracked config directly.",
    ""
  ];

  for (const provider of result.providers) {
    lines.push(
      `### ${provider.title}`,
      "",
      provider.description,
      "",
      provider.installCommand ? `Install manually if you want this provider:\n\n\`\`\`bash\n${provider.installCommand}\n\`\`\`` : "No package install is needed.",
      "",
      provider.envVars.length > 0 ? `Environment variables: ${provider.envVars.map((envVar) => `\`${envVar}\``).join(", ")}` : "Environment variables: none",
      "",
      "Config snippet:",
      "",
      "```yaml",
      provider.configSnippet.trimEnd(),
      "```",
      "",
      ...provider.notes.map((note) => `- ${note}`),
      ""
    );
  }

  lines.push(
    "### Safety",
    "",
    "- Dry-run is the default.",
    "- `--apply` writes only `.codedecay/local/memory-providers.yml` for review.",
    "- Copy snippets into tracked config only after review.",
    "- External providers remain opt-in and are not used by deterministic defaults.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function writeMemorySetupPreview(rootDir: string, providers: MemorySetupProviderPlan[]): string {
  const outputPath = join(rootDir, ".codedecay", "local", "memory-providers.yml");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderCombinedConfig(providers), "utf8");
  return outputPath;
}

function renderCombinedConfig(providers: MemorySetupProviderPlan[]): string {
  const providerIds = providers.map((provider) => provider.provider);
  const lines = [
    "# Review this snippet before copying it into .codedecay/config.yml.",
    "memoryProviders:",
    "  providers:",
    "    - local"
  ];

  if (providerIds.includes("mem0")) {
    lines.push(
      "    - provider: mem0",
      "      enabled: false",
      "      endpoint: http://127.0.0.1:8000",
      "      apiKeyEnv: MEM0_API_KEY",
      "      projectId: codedecay"
    );
  }

  if (providerIds.includes("supermemory")) {
    lines.push(
      "    - provider: supermemory",
      "      enabled: false",
      "      endpoint: http://127.0.0.1:8787",
      "      apiKeyEnv: SUPERMEMORY_API_KEY",
      "      collection: codedecay"
    );
  }

  return `${lines.join("\n")}\n`;
}

function expandProvider(provider: MemorySetupProvider): Exclude<MemorySetupProvider, "all">[] {
  if (provider === "all") {
    return ["local", "mem0", "supermemory"];
  }

  return [provider];
}

function createProviderPlan(provider: Exclude<MemorySetupProvider, "all">): MemorySetupProviderPlan {
  if (provider === "local") {
    return {
      provider,
      title: "Local .codedecay memory",
      description: "Repo-local memory is the default provider. It reads `.codedecay/memory.json` and needs no service.",
      envVars: [],
      configSnippet: [
        "memoryProviders:",
        "  providers:",
        "    - local",
        ""
      ].join("\n"),
      notes: [
        "Use `codedecay memory-import` or `codedecay memory-learn --apply` to write reviewable local memory.",
        "Commit `.codedecay/memory.json` only when the team wants that memory reviewed like source code."
      ]
    };
  }

  if (provider === "mem0") {
    return {
      provider,
      title: "Mem0",
      description: "Mem0 is an optional user-owned memory provider. CodeDecay imports it only when explicitly wired by future workflows.",
      installCommand: "npm install -D mem0ai",
      envVars: ["MEM0_API_KEY"],
      configSnippet: [
        "memoryProviders:",
        "  providers:",
        "    - local",
        "    - provider: mem0",
        "      enabled: false",
        "      endpoint: http://127.0.0.1:8000",
        "      apiKeyEnv: MEM0_API_KEY",
        "      projectId: codedecay",
        ""
      ].join("\n"),
      notes: [
        "Keep `enabled: false` until the repo explicitly opts into external memory.",
        "Use a local/self-hosted endpoint when you want to avoid hosted memory calls."
      ]
    };
  }

  return {
    provider,
    title: "Supermemory",
    description: "Supermemory is an optional user-owned memory provider. CodeDecay imports it only when explicitly wired by future workflows.",
    installCommand: "npm install -D supermemory",
    envVars: ["SUPERMEMORY_API_KEY"],
    configSnippet: [
      "memoryProviders:",
      "  providers:",
      "    - local",
      "    - provider: supermemory",
      "      enabled: false",
      "      endpoint: http://127.0.0.1:8787",
      "      apiKeyEnv: SUPERMEMORY_API_KEY",
      "      collection: codedecay",
      ""
    ].join("\n"),
    notes: [
      "CodeDecay does not call `Supermemory.local()` or auto-start local services.",
      "Keep `enabled: false` until the repo explicitly opts into external memory."
    ]
  };
}
