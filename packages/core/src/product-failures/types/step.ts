export interface ProductFailureStep {
  index: number;
  label: string;
  status: "passed" | "failed" | "skipped";
  expected?: string | undefined;
  actual?: string | undefined;
}
