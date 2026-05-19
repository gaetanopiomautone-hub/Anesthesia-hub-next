import { expect, type Page } from "@playwright/test";

/** Mese dedicato E2E (evita overlap con seed maggio 2026: 11–15). */
export const FERIE_E2E_MONTH = "2026-07";
export const FERIE_E2E_DAY_NUM = "15";
export const FERIE_E2E_START = "2026-07-15";
export const FERIE_E2E_END = "2026-07-15";

export function hasTraineeEnv(): boolean {
  return Boolean(process.env.E2E_SPECIALIZZANDO_EMAIL?.trim() && process.env.E2E_SPECIALIZZANDO_PASSWORD);
}

export function hasFerieCleanupEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.E2E_SPECIALIZZANDO_EMAIL?.trim(),
  );
}

/** Credenziali specializzando + service role per cleanup idempotente. */
export function hasFerieE2eEnv(): boolean {
  return hasTraineeEnv() && hasFerieCleanupEnv();
}

export async function openFerieMonth(page: Page, month: string, dayYmd?: string) {
  const query = dayYmd ? `?month=${month}&day=${dayYmd}` : `?month=${month}`;
  await page.goto(`/ferie${query}`);
  await expect(page.getByRole("heading", { name: "Richieste con approvazione amministrativa" })).toBeVisible();
}

export function calendarSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "Calendario mese" }) });
}

export async function clickCalendarDay(page: Page, dayNum: string) {
  const calendar = calendarSection(page);
  await calendar.getByRole("button", { name: dayNum, exact: true }).click();
}

export function newLeaveForm(page: Page) {
  return page.locator("#new-leave-request form");
}

export async function expectDateFields(page: Page, start: string, end: string) {
  const form = newLeaveForm(page);
  await expect(form.locator('input[name="startDate"]')).toHaveValue(start);
  await expect(form.locator('input[name="endDate"]')).toHaveValue(end);
}

export async function fillAndSubmitLeaveRequest(page: Page, reason: string) {
  const form = newLeaveForm(page);
  await form.locator('textarea[name="reason"]').fill(reason);
  await form.getByRole("button", { name: "Invia richiesta" }).click();
}

export async function expectNoPermissionDenied(page: Page) {
  await expect(page.getByText(/Permessi insufficienti/i)).toHaveCount(0);
  await expect(page.getByText(/42501/i)).toHaveCount(0);
}
