import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("meter readings calculate consumption and remain after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Register your first meter +" })
    .click();
  await page
    .getByLabel("Meter name / reference", { exact: true })
    .fill("Water 12");
  await page.getByLabel("Property / location", { exact: true }).fill("Flat 12");
  await page.getByLabel("Meter type", { exact: true }).selectOption("water");
  await page
    .getByRole("button", { name: "Register meter +", exact: true })
    .click();
  for (const [date, value] of [
    ["2020-01-01", "100.001"],
    ["2020-02-01", "110.002"],
  ]) {
    await page
      .getByRole("button", { name: "Add reading +", exact: true })
      .click();
    await page.getByLabel("Reading date", { exact: true }).fill(date);
    await page.getByLabel("Meter value", { exact: true }).fill(value);
    await page
      .getByRole("button", { name: "Save reading ↗", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Reading saved.");
  }
  await expect(page.locator(".usage-total strong")).toContainText("10.001");
  await page.reload();
  await expect(page.locator(".reading-card")).toHaveCount(2);
  await expect(page.locator(".usage-total strong")).toContainText("10.001");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all CSV ↓" }).click();
  expect((await pending).suggestedFilename()).toBe("meterlog-readings.csv");
});
test("bad backups do not create meters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByLabel("Restore Meterlog backup")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":2}'),
    });
  await expect(page.getByRole("status")).toContainText("not a valid");
  await page.getByRole("button", { name: "The log", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Register your first meter +" }),
  ).toBeVisible();
});
test("starts empty and passes mobile and accessibility checks", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Register your first meter +" }),
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((item) => ({
      id: item.id,
      targets: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
});
