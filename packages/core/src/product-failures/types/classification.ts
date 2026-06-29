export type ProductFailureClassification =
  | "confirmed-regression"
  | "likely-flaky"
  | "environment-failure"
  | "auth-or-test-data-failure"
  | "generated-test-weakness"
  | "unknown";
