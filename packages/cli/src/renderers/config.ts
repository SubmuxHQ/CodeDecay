import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import type { ConfigFormat } from "../types";

export function renderConfig(loadedConfig: LoadedCodeDecayConfig, format: ConfigFormat): string {
  if (format === "markdown") {
    return renderConfigMarkdown(loadedConfig);
  }

  return `${JSON.stringify(loadedConfig, null, 2)}\n`;
}

function renderConfigMarkdown(loadedConfig: LoadedCodeDecayConfig): string {
  const { config, sourcePath } = loadedConfig;
  const lines = [
    "## CodeDecay Config",
    "",
    `**Source:** ${sourcePath ? `\`${sourcePath}\`` : "defaults (no config file found)"}`,
    "",
    "### Safety",
    "",
    "| Setting | Value |",
    "| --- | ---: |",
    `| Command timeout | ${config.safety.commandTimeoutMs}ms |`,
    `| Allow configured commands | ${config.safety.allowCommands ? "yes" : "no"} |`,
    "",
    "### Commands",
    "",
    "| Type | Commands |",
    "| --- | --- |",
    `| Test | ${formatCommandList(config.commands.test)} |`,
    `| Build | ${formatCommandList(config.commands.build)} |`,
    `| Start | ${formatCommandList(config.commands.start)} |`,
    "",
    "### LLM",
    "",
    "| Setting | Value |",
    "| --- | --- |",
    `| Provider | ${config.llm.provider} |`,
    `| Model | ${config.llm.model ? `\`${config.llm.model}\`` : "none"} |`,
    `| Endpoint | ${config.llm.endpoint ? `\`${config.llm.endpoint}\`` : "none"} |`,
    `| API key env | ${config.llm.apiKeyEnv ? `\`${config.llm.apiKeyEnv}\`` : "none"} |`,
    `| Timeout | ${config.llm.timeoutMs}ms |`,
    "",
    "### Tool Adapters",
    ""
  ];

  appendConfigToolAdapters(lines, config.toolAdapters);

  lines.push("### Product Testing Targets", "");
  appendConfigProductTargets(lines, config.productTesting.targets);

  lines.push(
    "### Probes",
    ""
  );

  if (config.probes.length === 0) {
    lines.push("No probes configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Name | Command | Timeout |", "| --- | --- | ---: |");
  for (const probe of config.probes) {
    lines.push(
      `| ${probe.name} | \`${probe.command}\` | ${probe.timeoutMs ? `${probe.timeoutMs}ms` : "default"} |`
    );
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function appendConfigToolAdapters(
  lines: string[],
  toolAdapters: LoadedCodeDecayConfig["config"]["toolAdapters"]
): void {
  const rows = [
    formatConfigToolAdapter("Agent Process", toolAdapters.agentProcess),
    formatConfigToolAdapter("Playwright", toolAdapters.playwright),
    formatConfigToolAdapter("StrykerJS", toolAdapters.stryker),
    formatConfigToolAdapter("Schemathesis", toolAdapters.schemathesis),
    formatConfigToolAdapter("Pact", toolAdapters.pact),
    formatConfigToolAdapter("Semgrep", toolAdapters.semgrep),
    formatConfigToolAdapter("Coverage", toolAdapters.coverage)
  ].filter((row): row is string => row !== undefined);

  if (rows.length === 0) {
    lines.push("No tool adapters configured.", "");
    return;
  }

  lines.push("| Adapter | Enabled | Command/details | Timeout |", "| --- | --- | --- | ---: |", ...rows, "");
}

function formatConfigToolAdapter(
  name: string,
  adapter: LoadedCodeDecayConfig["config"]["toolAdapters"][keyof LoadedCodeDecayConfig["config"]["toolAdapters"]]
): string | undefined {
  if (!adapter) {
    return undefined;
  }

  const details = [
    adapter.command ? `command: \`${adapter.command}\`` : "command: default",
    "reportPath" in adapter && adapter.reportPath ? `reportPath: \`${adapter.reportPath}\`` : undefined,
    "schema" in adapter && adapter.schema ? `schema: \`${adapter.schema}\`` : undefined,
    "baseUrl" in adapter && adapter.baseUrl ? `baseUrl: \`${adapter.baseUrl}\`` : undefined,
    "config" in adapter && adapter.config ? `config: \`${adapter.config}\`` : undefined,
    "failOnSeverity" in adapter && adapter.failOnSeverity ? `failOnSeverity: ${adapter.failOnSeverity}` : undefined,
    "profile" in adapter && adapter.profile ? `profile: ${adapter.profile}` : undefined,
    "bundleFormat" in adapter && adapter.bundleFormat ? `bundleFormat: ${adapter.bundleFormat}` : undefined,
    "reportPaths" in adapter && adapter.reportPaths ? `reportPaths: \`${adapter.reportPaths.join(", ")}\`` : undefined,
    "failOn" in adapter && adapter.failOn ? `failOn: ${adapter.failOn}` : undefined
  ]
    .filter((item): item is string => item !== undefined)
    .join("<br>");

  return `| ${name} | ${adapter.enabled ? "yes" : "no"} | ${details} | ${adapter.timeoutMs ? `${adapter.timeoutMs}ms` : "default"} |`;
}

function appendConfigProductTargets(
  lines: string[],
  targets: LoadedCodeDecayConfig["config"]["productTesting"]["targets"]
): void {
  const entries = Object.values(targets);
  if (entries.length === 0) {
    lines.push("No product testing targets configured.", "");
    return;
  }

  lines.push(
    "| Target | Readiness | Effective URL | Commands | Health check | API endpoints | Timeout |",
    "| --- | --- | --- | --- | --- | ---: | ---: |"
  );
  for (const target of entries) {
    const effectiveUrl = target.readiness.effectiveBaseUrl ? `\`${target.readiness.effectiveBaseUrl}\`` : "none";
    const commands = target.readiness.commandsRequired.length > 0
      ? target.readiness.commandsRequired.map((command) => `\`${command}\``).join("<br>")
      : "none";
    lines.push(
      `| ${target.id} | ${target.readiness.status} (${target.readiness.mode}) | ${effectiveUrl} | ${commands} | ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"} | ${target.apiEndpoints.length} | ${target.timeoutMs}ms |`
    );
  }
  lines.push("", "Config inspection does not execute product target commands.", "");
}

function formatCommandList(commands: string[]): string {
  if (commands.length === 0) {
    return "none";
  }

  return commands.map((command) => `\`${command}\``).join("<br>");
}
