import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH, CODEDECAY_VERSION } from "../src/index";

describe("CODEDECAY_VERSION", () => {
  it("matches the published CLI package version", () => {
    const packageJson = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as { version: string };

    expect(CODEDECAY_VERSION).toBe(packageJson.version);
  });
});

describe("CODEDECAY_PRODUCT_LATEST_REPORT_PATH", () => {
  it("exports the stable local product report path", () => {
    expect(CODEDECAY_PRODUCT_LATEST_REPORT_PATH).toBe(".codedecay/local/product-runs/latest.json");
  });
});
