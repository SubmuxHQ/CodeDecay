import { describe, expect, it } from "vitest";
import { isTestFilePath } from "../src/paths/test-files";

describe("test file path classification", () => {
  it("keeps explicit test files and unambiguous test directories classified as tests", () => {
    expect(isTestFilePath("src/auth/session.test.ts")).toBe(true);
    expect(isTestFilePath("src/auth/session.spec.ts")).toBe(true);
    expect(isTestFilePath("src/tests/session.integration.ts")).toBe(true);
    expect(isTestFilePath("src/__tests__/session.ts")).toBe(true);
    expect(isTestFilePath("src\\__specs__\\session.ts")).toBe(true);
    expect(isTestFilePath("test_users.py")).toBe(true);
  });

  it("recognizes conventional test roots outside production source directories", () => {
    expect(isTestFilePath("test/session.ts")).toBe(true);
    expect(isTestFilePath("tests/session.ts")).toBe(true);
    expect(isTestFilePath("test/src/session.ts")).toBe(true);
    expect(isTestFilePath("packages/auth/test/session.ts")).toBe(true);
    expect(isTestFilePath("packages/auth/test/src/session.ts")).toBe(true);
    expect(isTestFilePath("packages/auth/integration/session.ts")).toBe(true);
  });

  it("keeps unsuffixed modules in ambiguous src test directories classified as source", () => {
    expect(isTestFilePath("packages/analyzer-js/src/tests/weak-audit/findings.ts")).toBe(false);
    expect(isTestFilePath("packages/analyzer-js/src/test/top-level-execution.ts")).toBe(false);
    expect(isTestFilePath("packages/api/src/integration/client.ts")).toBe(false);
    expect(isTestFilePath("packages/test/src/index.ts")).toBe(false);
    expect(isTestFilePath("packages/test-audit/src/index.ts")).toBe(false);
  });
});
