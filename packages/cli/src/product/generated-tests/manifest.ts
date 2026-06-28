import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type { ProductGeneratedTestManifest, ProductGeneratedTestsResult } from "../../types";
import { defaultProductGeneratedApiTestManifestPath, defaultProductGeneratedTestManifestPath } from "./paths";
import { elapsed } from "./strings";

export function loadGeneratedProductTestsForTarget(rootDir: string, target: CodeDecayProductTarget): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const manifestPath = defaultProductGeneratedTestManifestPath(target.id);
  const notes = [
    "Loaded existing generated tests without regenerating source.",
    "Review edits are preserved when using --run-generated-tests without --generate-tests."
  ];

  if (!existsSync(join(rootDir, manifestPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Generated test manifest not found at ${manifestPath}. Run codedecay product --target ${target.id} --generate-tests first.`,
      notes
    };
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), "utf8")) as ProductGeneratedTestManifest;
    if (!manifest.testSourcePath || !existsSync(join(rootDir, manifest.testSourcePath))) {
      return {
        status: "blocked",
        manifestPath,
        tests: manifest.tests ?? [],
        durationMs: elapsed(startedAt),
        error: `Generated test source not found at ${manifest.testSourcePath}. Run codedecay product --target ${target.id} --generate-tests first.`,
        notes
      };
    }

    return {
      status: "passed",
      sourcePath: manifest.testSourcePath,
      manifestPath,
      tests: manifest.tests ?? [],
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      manifestPath,
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read generated test manifest ${manifestPath}: ${message}`,
      notes
    };
  }
}

export function loadGeneratedProductApiTestsForTarget(rootDir: string, target: CodeDecayProductTarget): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const manifestPath = defaultProductGeneratedApiTestManifestPath(target.id);
  const notes = [
    "Loaded existing generated API tests without regenerating source.",
    "Review edits are preserved when using --run-generated-api-tests without --generate-api-tests."
  ];

  if (!existsSync(join(rootDir, manifestPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Generated API test manifest not found at ${manifestPath}. Run codedecay product --target ${target.id} --generate-api-tests first.`,
      notes
    };
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), "utf8")) as ProductGeneratedTestManifest;
    if (!manifest.testSourcePath || !existsSync(join(rootDir, manifest.testSourcePath))) {
      return {
        status: "blocked",
        manifestPath,
        tests: manifest.tests ?? [],
        durationMs: elapsed(startedAt),
        error: `Generated API test source not found at ${manifest.testSourcePath}. Run codedecay product --target ${target.id} --generate-api-tests first.`,
        notes
      };
    }

    return {
      status: "passed",
      sourcePath: manifest.testSourcePath,
      manifestPath,
      tests: manifest.tests ?? [],
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      manifestPath,
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read generated API test manifest ${manifestPath}: ${message}`,
      notes
    };
  }
}

export function generatedProductBaseUrl(rootDir: string, generatedTests: ProductGeneratedTestsResult): string | undefined {
  if (!generatedTests.manifestPath || !existsSync(join(rootDir, generatedTests.manifestPath))) {
    return undefined;
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, generatedTests.manifestPath), "utf8")) as ProductGeneratedTestManifest;
    return manifest.target.baseUrl;
  } catch {
    return undefined;
  }
}
