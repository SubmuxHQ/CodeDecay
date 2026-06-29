export interface HelpOptionDoc {
  flag: string;
  description: string;
}

export interface CommandDoc {
  name: string;
  summary: string;
  usage: string[];
  description: string[];
  options: HelpOptionDoc[];
  examples: string[];
  notes?: string[];
}

export interface UpdatePlanView {
  manager?: string | undefined;
  source: string;
  displayCommand: string;
  canApply: boolean;
}

export interface UninstallPlanView {
  manager?: string | undefined;
  source: string;
  displayCommand?: string | undefined;
  dependencyLocation: "devDependencies" | "dependencies" | "optionalDependencies" | "none";
  dependencyVersion?: string | undefined;
  purgeTargets: string[];
  canApplyPackage: boolean;
}
