import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("landing loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
