import type { ImpactedRoute } from "@submuxhq/codedecay-core";
import { mergeImpactedRoutes } from "./merge";
import { detectNextjsRoute } from "./nextjs";
import { detectNodeRoutes } from "./node";
import { detectRemixRoute } from "./remix";

export { mergeImpactedRoutes };

export function detectRoutesForFile(path: string, content: string): ImpactedRoute[] {
  return [
    ...detectNextjsRoute({ path }, content),
    ...detectNodeRoutes({ path }, content),
    ...detectRemixRoute({ path }, content)
  ];
}
