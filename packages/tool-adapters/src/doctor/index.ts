export { createDoctorReport, createToolRecommendations, detectDoctorSignals, renderConfigPreview } from "./detect";
export { EXTERNAL_TOOL_REGISTRY, getExternalTool } from "./registry";
export { renderDoctorMarkdown, renderDoctorReport } from "./render";

export type { DoctorFormat } from "./render";
export type {
  DoctorReport,
  DoctorSignal,
  DoctorSignalKind,
  ExternalToolCapability,
  ToolInstallCommands,
  ToolRecommendation,
  ToolRecommendationPriority
} from "./types";
