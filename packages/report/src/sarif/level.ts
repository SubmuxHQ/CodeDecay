import type { RiskLevel } from "@submuxhq/codedecay-core";

export function sarifLevel(level: RiskLevel): "error" | "warning" | "note" {
  if (level === "high") {
    return "error";
  }

  if (level === "medium") {
    return "warning";
  }

  return "note";
}
