export interface StrykerMutationReportAnalysis {
  reportPath: string;
  totalMutants: number;
  survivedMutants: number;
  noCoverageMutants: number;
  weakMutants: StrykerWeakMutant[];
  mutationScore?: number | undefined;
  parseError?: string | undefined;
}

export interface StrykerWeakMutant {
  id?: string | undefined;
  file: string;
  line?: number | undefined;
  status: "Survived" | "NoCoverage";
  mutatorName?: string | undefined;
  replacement?: string | undefined;
  statusReason?: string | undefined;
}
