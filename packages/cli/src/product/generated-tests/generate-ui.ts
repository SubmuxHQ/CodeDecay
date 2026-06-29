import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import { sanitizeArtifactSegment } from "../exploration";
import type {
  ProductFlowMap,
  ProductGeneratedTestManifest,
  ProductGeneratedTestsResult
} from "../../types";
import type { ProductGeneratedTestDependencies } from "./dependencies";
import {
  defaultProductFlowMapPath,
  writeOutput
} from "./paths";
import { elapsed } from "./strings";
import { createGeneratedProductTestCases, renderGeneratedProductTestSource } from "./ui";

export function generateProductTestsForTarget(
  rootDir: string,
  target: CodeDecayProductTarget,
  flowMapArtifactPath: string | undefined,
  dependencies: ProductGeneratedTestDependencies
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated tests are written for review and are never committed or promoted automatically.",
    "Locator strategy prefers roles, labels, placeholders, and visible text before selector fallbacks."
  ];
  const sourceFlowMapPath = flowMapArtifactPath ?? defaultProductFlowMapPath(target.id);

  if (!existsSync(join(rootDir, sourceFlowMapPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Flow map artifact not found at ${sourceFlowMapPath}. Run codedecay product --target ${target.id} --explore first.`,
      notes
    };
  }

  let flowMap: ProductFlowMap;
  try {
    flowMap = JSON.parse(readFileSync(join(rootDir, sourceFlowMapPath), "utf8")) as ProductFlowMap;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read flow map ${sourceFlowMapPath}: ${message}`,
      notes
    };
  }

  const impactedPaths = dependencies.findPrioritizedProductPaths(rootDir);
  const tests = createGeneratedProductTestCases(flowMap, impactedPaths);
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "Flow map did not contain enough safe route, link, input, or form evidence to generate tests.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "product.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const source = renderGeneratedProductTestSource(flowMap, tests, sourceFlowMapPath);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl: flowMap.target.baseUrl
    },
    sourceFlowMapPath,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/e2e/codedecay-product.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes
  };
}
