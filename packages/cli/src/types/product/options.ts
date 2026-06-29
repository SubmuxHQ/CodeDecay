import type { ProductFailureClassification } from "@submuxhq/codedecay-core";
import type { ConfigFormat } from "../common";

export interface ProductOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  target?: string | undefined;
  testId?: string | undefined;
  explore: boolean;
  generateTests: boolean;
  runGeneratedTests: boolean;
  generateApiTests: boolean;
  runGeneratedApiTests: boolean;
  failOnClassifications?: ProductFailureClassification[] | undefined;
  maxPages: number;
  maxActions: number;
  allowDestructiveActions: boolean;
}
