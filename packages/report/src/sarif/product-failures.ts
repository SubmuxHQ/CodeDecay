import type { ProductFailureBundle } from "@submuxhq/codedecay-core";

export function productFailureRuleId(bundle: ProductFailureBundle): string {
  return `product-verification/${bundle.checkKind}/${bundle.checkId}`;
}
