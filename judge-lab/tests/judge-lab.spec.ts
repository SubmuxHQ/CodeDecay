import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("one click runs live auth analysis and exposes exact evidence links", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Find what your coding agent missed/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Red-team the risky PR" }).click();
  const result = page.getByTestId("analysis-result");
  await expect(result).toBeVisible();
  await expect(result.getByText("LIVE EXECUTION")).toBeVisible();
  await expect(result.getByText("Missing auth entry-point candidate")).toBeVisible();
  await expect(result.getByText("/api/users", { exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: "Exact source ↗" })).toHaveAttribute(
    "href",
    /github\.com\/SubmuxHQ\/CodeDecay\/tree\/[0-9a-f]{7,40}\/judge-lab|github\.com\/SubmuxHQ\/CodeDecay\/tree\/main\/judge-lab/,
  );
});

test("switches between risky, repaired, weak-test, and clean-decoy states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Run selected scenario/ }).click();
  const result = page.getByTestId("analysis-result");
  await expect(result).toBeVisible();

  await page.getByRole("button", { name: "Repaired", exact: true }).click();
  await expect(result.getByText("No blocker invented.", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /The test that tests itself/ }).click();
  await page.getByRole("button", { name: "Risky PR", exact: true }).click();
  await expect(result.getByText("PRECOMPUTED EVIDENCE", { exact: true })).toBeVisible();
  await expect(
    result.getByText("Changed test mocks changed source", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: /Harmless docs cleanup/ }).click();
  await expect(result.getByText("No blocker invented.", { exact: true })).toBeVisible();
  await expect(result.getByText("No runtime route", { exact: true })).toBeVisible();
});

test("surfaces a recoverable analysis failure", async ({ page }) => {
  await page.route("**/api/run", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture engine temporarily unavailable." }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Run selected scenario/ }).click();
  await expect(page.getByRole("alert")).toContainText("Fixture engine temporarily unavailable.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("has no serious or critical automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(severe).toEqual([]);
});

test("publishes the captioned genuine Codex repair demo and evidence links", async ({ page }) => {
  await page.goto("/#demo");
  const demo = page.locator("#demo");
  await expect(
    demo.getByRole("heading", { name: "From false green to real proof." }),
  ).toBeVisible();
  await expect(demo.locator("video")).toHaveAttribute(
    "poster",
    "/demo/codedecay-codex-repair-poster.png",
  );
  await expect(demo.locator("source")).toHaveAttribute("src", "/demo/codedecay-codex-repair.mp4");
  await expect(demo.locator("track")).toHaveAttribute("src", "/demo/codedecay-codex-repair.vtt");
  await expect(demo.getByRole("link", { name: "Evidence index ↗" })).toHaveAttribute(
    "href",
    /docs\/hackathon\/demo\/evidence\/run-v3\.md/,
  );
});
