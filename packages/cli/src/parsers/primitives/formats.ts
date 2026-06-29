import type { RedteamFormat } from "@submuxhq/codedecay-redteam";
import type { ReportFormat } from "@submuxhq/codedecay-report";
import type { ConfigFormat } from "../../types";

const VALID_FORMATS = new Set<ReportFormat>(["json", "markdown", "sarif"]);
const VALID_CONFIG_FORMATS = new Set<ConfigFormat>(["json", "markdown"]);

export function parseFormat(value: string): ReportFormat {
  if (VALID_FORMATS.has(value as ReportFormat)) {
    return value as ReportFormat;
  }

  throw new Error(`Invalid format "${value}". Expected json, markdown, or sarif.`);
}

export function parseConfigFormat(value: string): ConfigFormat {
  if (VALID_CONFIG_FORMATS.has(value as ConfigFormat)) {
    return value as ConfigFormat;
  }

  throw new Error(`Invalid config format "${value}". Expected json or markdown.`);
}

export function parseRedteamFormat(value: string): RedteamFormat {
  if (VALID_CONFIG_FORMATS.has(value as RedteamFormat)) {
    return value as RedteamFormat;
  }

  throw new Error(`Invalid redteam format "${value}". Expected json or markdown.`);
}
