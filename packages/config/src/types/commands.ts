export interface CodeDecayCommands {
  test: string[];
  build: string[];
  start: string[];
}

export interface CodeDecayProbe {
  name: string;
  command: string;
  timeoutMs?: number | undefined;
}
