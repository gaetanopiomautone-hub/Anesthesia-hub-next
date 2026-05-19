import { expect, test } from "@playwright/test";

import { loginWithEmailPassword } from "./auth";
import { cleanupFerieE2eLeaves } from "./ferie-cleanup";
import {
  clickCalendarDay,
  expectDateFields,
  expectNoPermissionDenied,
  FERIE_E2E_DAY_NUM,
  FERIE_E2E_END,
  FERIE_E2E_MONTH,
  FERIE_E2E_START,
  fillAndSubmitLeaveRequest,
  hasFerieE2eEnv,
  hasTraineeEnv,
  openFerieMonth,
} from "./ferie-helpers";

test.describe.serial("Ferie — specializzando", () => {
  test.skip(
    !hasFerieE2eEnv(),
    "Richiede E2E_SPECIALIZZANDO_* + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (cleanup, vedi README).",
  );

  const reasonTag = `E2E-ferie-${Date.now()}`;

  test.beforeAll(async () => {
    const result = await cleanupFerieE2eLeaves();
    test.info().annotations.push({
      type: "cleanup",
      description: `Rimosse ${result.deleted} richieste ferie su ${FERIE_E2E_START} per profilo ${result.profileId ?? "n/d"}.`,
    });
  });

  test("login, calendario, date picker, submit, ok=created, richiesta in attesa", async ({ page }) => {
    const email = process.env.E2E_SPECIALIZZANDO_EMAIL!.trim();
    const password = process.env.E2E_SPECIALIZZANDO_PASSWORD!;

    await loginWithEmailPassword(page, email, password);
    await openFerieMonth(page, FERIE_E2E_MONTH);

    await clickCalendarDay(page, FERIE_E2E_DAY_NUM);
    await expect(page).toHaveURL(new RegExp(`month=${FERIE_E2E_MONTH}.*day=${FERIE_E2E_START}`));
    await expectDateFields(page, FERIE_E2E_START, FERIE_E2E_END);

    await fillAndSubmitLeaveRequest(page, reasonTag);

    await page.waitForURL((url) => url.pathname === "/ferie" && url.searchParams.get("ok") === "created", {
      timeout: 25_000,
    });
    await expect(page.getByRole("status")).toContainText(/Richiesta ferie inviata/i);
    await expectNoPermissionDenied(page);

    await expect(page.getByText("In attesa").first()).toBeVisible();
    await expect(page.getByText(reasonTag)).toBeVisible();
  });

  test("stesso periodo: errore overlap leggibile, nessun 42501", async ({ page }) => {
    const email = process.env.E2E_SPECIALIZZANDO_EMAIL!.trim();
    const password = process.env.E2E_SPECIALIZZANDO_PASSWORD!;

    await loginWithEmailPassword(page, email, password);
    await openFerieMonth(page, FERIE_E2E_MONTH, FERIE_E2E_START);

    await expectDateFields(page, FERIE_E2E_START, FERIE_E2E_END);

    await fillAndSubmitLeaveRequest(page, `${reasonTag}-dup`);

    await page.waitForURL(
      (url) => url.pathname === "/ferie" && url.searchParams.get("errorCode") === "overlap",
      { timeout: 25_000 },
    );

    await expect(page.getByRole("alert")).toContainText(/Hai già una richiesta ferie in questo periodo/i);
    await expectNoPermissionDenied(page);
    expect(page.url()).not.toContain("ok=created");
  });
});

test.describe("Ferie — specializzando (overlap seed maggio)", () => {
  test.skip(!hasTraineeEnv(), "Impostare E2E_SPECIALIZZANDO_EMAIL e E2E_SPECIALIZZANDO_PASSWORD (vedi README).");

  test("2026-05 giorno 15: overlap se presente richiesta seed 11–15, senza 42501", async ({ page }) => {
    const email = process.env.E2E_SPECIALIZZANDO_EMAIL!.trim();
    const password = process.env.E2E_SPECIALIZZANDO_PASSWORD!;

    await loginWithEmailPassword(page, email, password);
    await openFerieMonth(page, "2026-05");

    await clickCalendarDay(page, "15");
    await expectDateFields(page, "2026-05-15", "2026-05-15");

    await fillAndSubmitLeaveRequest(page, `E2E-ferie-maggio-${Date.now()}`);

    await page.waitForURL((url) => url.pathname === "/ferie", { timeout: 25_000 });
    await expectNoPermissionDenied(page);

    const url = new URL(page.url());
    const overlap = url.searchParams.get("errorCode") === "overlap";
    const created = url.searchParams.get("ok") === "created";

    expect(overlap || created).toBe(true);

    if (overlap) {
      await expect(page.getByRole("alert")).toContainText(/Hai già una richiesta ferie in questo periodo/i);
    } else {
      await expect(page.getByRole("status")).toContainText(/Richiesta ferie inviata/i);
      test.info().annotations.push({
        type: "note",
        description: "Nessuna richiesta seed in maggio per questo utente: creato ok=created (comportamento valido).",
      });
    }
  });
});
