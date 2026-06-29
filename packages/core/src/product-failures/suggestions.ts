import { dedupeStrings } from "../collections";
import type { ProductCheckKind, ProductFailureClassification } from "../types";

export function productFailureSuggestedFixTasks(
  classification: ProductFailureClassification,
  checkKind: ProductCheckKind
): string[] {
  const common = [
    "Treat auto-healing as review-only: do not update expected behavior unless a human confirms the product requirement changed."
  ];

  if (classification === "likely-flaky") {
    return dedupeStrings([
      ...common,
      "Re-run the targeted check and inspect timing, async state, network waits, and test isolation before changing product code.",
      "If behavior is correct, propose a reviewed wait/assertion stabilization patch for the generated test."
    ]);
  }

  if (classification === "environment-failure") {
    return dedupeStrings([
      ...common,
      "Fix preview URL, local startup, browser/Playwright install, network, or health-check setup before treating this as product behavior."
    ]);
  }

  if (classification === "auth-or-test-data-failure") {
    return dedupeStrings([
      ...common,
      "Add or repair auth setup, seeded fixtures, test accounts, permissions, or data reset before changing assertions."
    ]);
  }

  if (classification === "generated-test-weakness") {
    return dedupeStrings([
      ...common,
      "Suggest a reviewed generated-test patch using a stronger role/label/test-id locator, stable assertion, or explicit wait.",
      "Verify the product behavior manually or with an independent check before accepting any selector-only repair."
    ]);
  }

  if (classification === "confirmed-regression") {
    return dedupeStrings([
      ...common,
      checkKind === "api"
        ? "Inspect the failing API route, request data, auth setup, and response contract; fix product behavior before changing the generated test."
        : "Inspect the failing UI flow and product behavior; fix the product regression before changing the generated test."
    ]);
  }

  return dedupeStrings([
    ...common,
    checkKind === "api"
      ? "Inspect the failing API route, request data, auth setup, and response contract."
      : "Inspect the failing UI flow, locator stability, and product behavior."
  ]);
}
