export type BenchmarkFormat = "json" | "markdown";

export interface BenchmarkOptions {
  format: BenchmarkFormat;
  output?: string | undefined;
  corpus?: string | undefined;
}
