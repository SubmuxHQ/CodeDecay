export interface LoadCodeDecaySkillsOptions {
  cwd: string;
}

export interface LoadedCodeDecaySkills {
  sourceDir?: string | undefined;
  skills: CodeDecaySkill[];
}

export interface CodeDecaySkill {
  id: string;
  title: string;
  path: string;
  summary: string;
  content: string;
  untrusted: true;
}
