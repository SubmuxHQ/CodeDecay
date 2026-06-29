import type { RiskLevel } from "@submuxhq/codedecay-core";

export function riskBadge(level: RiskLevel): string {
  if (level === "high") {
    return "High";
  }

  if (level === "medium") {
    return "Medium";
  }

  return "Low";
}

export function routeLabel(framework: string, kind: string): string {
  const frameworkLabel =
    framework === "nextjs" ? "Next.js" : framework === "express" ? "Express" : framework === "fastify" ? "Fastify" : "Node";

  if (kind === "api-route") {
    return `${frameworkLabel} API route`;
  }

  if (kind === "ui-route") {
    return `${frameworkLabel} UI route`;
  }

  if (kind === "middleware") {
    return `${frameworkLabel} middleware`;
  }

  return `${frameworkLabel} route handler`;
}
