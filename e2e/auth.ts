import type { Page } from "@playwright/test";

export async function loginWithEmailPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/Email istituzionale/i).fill(email);
  await page.getByLabel(/^Password$/i).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 25_000 });
}
