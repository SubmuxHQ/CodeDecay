export function findReverseImportChains(sourcePath: string, reverseImportGraph: Map<string, string[]>): string[][] {
  const queue: string[][] = [[sourcePath]];
  const visited = new Set<string>([sourcePath]);
  const chains: string[][] = [];

  while (queue.length > 0 && chains.length < 24) {
    const chain = queue.shift();
    if (!chain) {
      continue;
    }

    const current = chain.at(-1);
    if (!current) {
      continue;
    }

    for (const importer of reverseImportGraph.get(current) ?? []) {
      if (chain.includes(importer) || chain.length >= 6) {
        continue;
      }

      const nextChain = [...chain, importer];
      chains.push(nextChain);

      if (!visited.has(importer)) {
        visited.add(importer);
        queue.push(nextChain);
      }
    }
  }

  return chains;
}
