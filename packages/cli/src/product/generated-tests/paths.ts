import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { sanitizeArtifactSegment } from "../exploration";

export function defaultProductFlowMapPath(targetId: string): string {
  return join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(targetId), "flow-map.json");
}

export function defaultProductGeneratedTestManifestPath(targetId: string): string {
  return join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(targetId), "manifest.json");
}

export function defaultProductGeneratedApiTestManifestPath(targetId: string): string {
  return join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(targetId), "manifest.json");
}

export function relativePathForArtifact(rootDir: string, absolutePath: string): string {
  const artifactPath = relative(rootDir, absolutePath);
  return artifactPath && !artifactPath.startsWith("..") ? artifactPath : absolutePath;
}

export function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}
