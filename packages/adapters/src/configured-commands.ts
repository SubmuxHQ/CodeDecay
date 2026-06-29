import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import { createCommandAdapter } from "./command-adapter";
import { slugify } from "./slug";
import type { ConfiguredCommandAdapter, ConfiguredCommandKind } from "./types";

export function createConfiguredCommandAdapters(config: CodeDecayConfig): ConfiguredCommandAdapter[] {
  return [
    ...config.commands.test.map((command, index) =>
      createConfiguredCommandAdapter("test", command, `test-${index + 1}`, `Test command ${index + 1}`)
    ),
    ...config.commands.build.map((command, index) =>
      createConfiguredCommandAdapter("build", command, `build-${index + 1}`, `Build command ${index + 1}`)
    ),
    ...config.commands.start.map((command, index) =>
      createConfiguredCommandAdapter("start", command, `start-${index + 1}`, `Start command ${index + 1}`)
    ),
    ...config.probes.map((probe, index) =>
      createConfiguredCommandAdapter("probe", probe.command, `probe-${slugify(probe.name, index + 1)}`, `Probe: ${probe.name}`, probe.timeoutMs)
    )
  ];
}

function createConfiguredCommandAdapter(
  kind: ConfiguredCommandKind,
  command: string,
  id: string,
  name: string,
  timeoutMs?: number | undefined
): ConfiguredCommandAdapter {
  return {
    kind,
    command,
    adapter: createCommandAdapter({
      id,
      name,
      command,
      timeoutMs,
      requiresCommandAllowlist: true
    })
  };
}
