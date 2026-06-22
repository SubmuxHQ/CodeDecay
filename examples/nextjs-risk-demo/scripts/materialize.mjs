import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scenario = process.argv[2] ?? "baseline";
const allowedScenarios = new Set(["baseline", "risky"]);

if (!allowedScenarios.has(scenario)) {
  console.error('Usage: node scripts/materialize.mjs baseline|risky');
  process.exit(2);
}

const scenarioUrl = new URL(`../scenarios/${scenario}/`, import.meta.url);

for (const snapshotName of readdirSync(scenarioUrl).sort()) {
  if (!snapshotName.endsWith(".fixture")) {
    continue;
  }

  const outputPath = fileURLToPath(new URL(`../${decodeSnapshotName(snapshotName)}`, import.meta.url));
  const contents = readFileSync(new URL(snapshotName, scenarioUrl), "utf8");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, contents, "utf8");
}

console.log(`Materialized the ${scenario} Next.js-style files.`);

function decodeSnapshotName(snapshotName) {
  return snapshotName.slice(0, -".fixture".length).replaceAll("__", "/").replaceAll("_DOT_", ".");
}
