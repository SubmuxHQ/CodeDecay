export type DoctorSignalKind =
  | "framework"
  | "language"
  | "package-manager"
  | "test-runner"
  | "api-schema"
  | "tool-config"
  | "ci"
  | "security";

export type ToolRecommendationPriority = "high" | "medium" | "low";

export interface DoctorSignal {
  kind: DoctorSignalKind;
  value: string;
  source: string;
}

export interface ToolInstallCommands {
  npm?: string | undefined;
  pnpm?: string | undefined;
  yarn?: string | undefined;
  bun?: string | undefined;
  pipx?: string | undefined;
  pip?: string | undefined;
  brew?: string | undefined;
  manual?: string | undefined;
}

export interface ExternalToolCapability {
  id: string;
  name: string;
  purpose: string;
  categories: string[];
  install: ToolInstallCommands;
  defaultCommand: string;
  evidence: string;
  docsUrl: string;
  license: string;
  requiresExecution: boolean;
  mayUseNetwork: boolean;
  codeDecayAdapter?: string | undefined;
}

export interface ToolRecommendation {
  tool: ExternalToolCapability;
  priority: ToolRecommendationPriority;
  reason: string;
  matchedSignals: DoctorSignal[];
  configPreview?: string | undefined;
}

export interface DoctorReport {
  tool: "CodeDecay";
  cwd: string;
  signals: DoctorSignal[];
  recommendations: ToolRecommendation[];
  safety: {
    commandsExecuted: false;
    toolsInstalled: false;
    networkUsed: false;
    llmCalled: false;
    telemetrySent: false;
  };
}
