import { JWT_AUTH_KNOWLEDGE_PACK } from "./packs/jwt-auth";
import type { KnowledgeArea, KnowledgePack, KnowledgePackMatchInput } from "./types";

export const KNOWLEDGE_PACKS: KnowledgePack[] = [JWT_AUTH_KNOWLEDGE_PACK];

export function getKnowledgePack(area: KnowledgeArea): KnowledgePack | undefined {
  return KNOWLEDGE_PACKS.find((pack) => pack.area === area);
}

export function matchKnowledgePacks(input: KnowledgePackMatchInput): KnowledgePack[] {
  const impactedAreas = new Set(input.impactedAreas.map((area) => area.toLowerCase()));
  const changedPaths = input.changedPaths.map((path) => path.toLowerCase());

  return KNOWLEDGE_PACKS.filter((pack) => {
    const areaMatch = pack.match.impactedAreas.some((area) => impactedAreas.has(area));
    const pathMatch = changedPaths.some((path) => pack.match.fileKeywords.some((keyword) => path.includes(keyword)));
    return areaMatch || pathMatch;
  }).sort((left, right) => left.area.localeCompare(right.area));
}
