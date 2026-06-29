import type { AdapterContext, AdapterResult, CodeDecayAdapter } from "./types";

export async function runAdapters(
  adapters: CodeDecayAdapter[],
  context: AdapterContext
): Promise<AdapterResult[]> {
  const results: AdapterResult[] = [];

  for (const adapter of adapters) {
    results.push(await adapter.run(context));
  }

  return results;
}
