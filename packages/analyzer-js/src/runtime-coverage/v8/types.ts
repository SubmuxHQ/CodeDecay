export interface V8CoverageRange {
  startOffset: number;
  endOffset: number;
  count: number;
}

export interface V8CoverageScript {
  url: string;
  ranges: V8CoverageRange[];
}
