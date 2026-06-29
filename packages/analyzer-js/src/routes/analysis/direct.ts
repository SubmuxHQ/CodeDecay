import type { FileChange, ImpactedRoute } from "@submuxhq/codedecay-core";
import { detectRoutesForFile, mergeImpactedRoutes } from "../impact";
import { readChangedFile } from "./io";

export function detectDirectRouteImpacts(rootDir: string, changedSourceFiles: FileChange[]): ImpactedRoute[] {
  return mergeImpactedRoutes(
    changedSourceFiles.flatMap((change) => {
      const content = readChangedFile(rootDir, change.path) ?? change.addedLines.map((line) => line.content).join("\n");

      return detectRoutesForFile(change.path, content);
    })
  );
}
