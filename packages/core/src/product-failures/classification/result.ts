import type { ProductFailureClassification } from "../types";

export interface ProductFailureClassificationResult {
  classification: ProductFailureClassification;
  confidence: number;
  evidence: string[];
}
