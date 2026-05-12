import { expect, test } from "@playwright/test";

import { loginWithEmailPassword } from "./auth";

const planningMeButton = /^(Solo il mio planning|Il mio planning)$/i;

function hasAdminEnv(): boolean {
  return Boolean(process.env.E2E_ADMIN_EMAIL?.trim() && process.env.E2E_ADMIN_PASSWORD);
}

function hasTraineeEnv(): boolean {
  return Boolean(process.env.E2E_SPECIALIZZANDO_EMAIL?.trim() && process.env.E2E_SPECIALIZZANDO_PASSWORD);
}

test.describe("Turni — admin (flusso principale)", () => {
  test.skip(!hasAdminEnv(), "Impostare E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD (vedi README).");

  test("login, barra planning, filtro «solo il mio», piano opzionale approve/publish/PDF/Excel/riapri", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL!.trim();
    const password = process.env.E2E_ADMIN_PASSWORD!;

    await loginWithEmailPassword(page, email, password);
    await page.goto("/turni");
    await expect(page.getByRole("heading", { name: "Piano turni del mese" })).toBeVisible();

    await expect(page.getByRole("link", { name: "Mese precedente" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mese successivo" })).toBeVisible();

    const soloMio = page.getByRole("button", { name: planningMeButton });
    await expect(soloMio).toBeVisible();
    await soloMio.click();
    await expect(soloMio).toHaveClass(/bg-primary/);

    const noPlan = page.getByText("Nessun planning per questo mese");
    if (await noPlan.isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "Nessun piano per il mese corrente: skip approve/publish/reopen.",
      });
      const excel = page.getByRole("link", { name: "Esporta Excel" });
      if ((await excel.count()) > 0) {
        await expect(excel.first()).toHaveAttribute("href", /\/turni\/monthly-plan-excel\?month=\d{4}-\d{2}/);
      }
      return;
    }

    await expect(page.getByText("Piano in database")).toBeVisible();

    const approva = page.getByRole("button", { name: "Approva mese" });
    if (await approva.isVisible()) {
      await approva.click();
      await expect(page.getByText(/Piano mese approvato/i)).toBeVisible({ timeout: 20_000 });
    }

    const pubblica = page.getByRole("button", { name: "Pubblica turni" });
    if (await pubblica.isVisible()) {
      await pubblica.click();
      await expect(page.getByText(/Turni pubblicati al reparto per questo mese/i)).toBeVisible({ timeout: 20_000 });
    }

    if (await page.getByText(/Turni pubblicati per/i).first().isVisible().catch(() => false)) {
      await expect(page.getByText(/Turni pubblicati per/i).first()).toBeVisible();
    }

    const excel = page.getByRole("link", { name: "Esporta Excel" });
    await expect(excel.first()).toHaveAttribute("href", /\/turni\/monthly-plan-excel\?month=\d{4}-\d{2}/);

    const pdfLink = page.getByRole("link", { name: /Genera PDF mensile/i });
    if ((await pdfLink.count()) > 0) {
      await expect(pdfLink.first()).toHaveAttribute("href", /\/turni\/monthly-plan-pdf\?month=\d{4}-\d{2}/);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "PDF non disponibile come link (piano non approvato in questo ambiente).",
      });
    }

    const riapri = page.getByRole("button", { name: "Riapri mese" });
    if (await riapri.isVisible()) {
      await riapri.click();
      await expect(page.getByText(/Piano mese riaperto/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Bozza/i).first()).toBeVisible();
      await expect(page.getByText(/Turni pubblicati per/i)).toHaveCount(0);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Riapri mese non visibile (piano non approvato): skip verifica reset pubblicazione.",
      });
    }
  });
});

test.describe("Turni — specializzando (pre/post pubblicazione)", () => {
  test.skip(!hasTraineeEnv(), "Impostare E2E_SPECIALIZZANDO_EMAIL e E2E_SPECIALIZZANDO_PASSWORD (vedi README).");

  test("mese senza piano (2099-01): nessuna griglia, nessun export, nessuna azione admin", async ({ page }) => {
    const email = process.env.E2E_SPECIALIZZANDO_EMAIL!.trim();
    const password = process.env.E2E_SPECIALIZZANDO_PASSWORD!;

    await loginWithEmailPassword(page, email, password);
    await page.goto("/turni?month=2099-01");
    await expect(page.getByRole("heading", { name: "Piano turni del mese" })).toBeVisible();

    await expect(page.getByText("Nessun planning per questo mese")).toBeVisible();
    await expect(page.getByRole("link", { name: "Esporta Excel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Esporta Excel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Tutti$/ })).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Approva mese" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pubblica turni" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Riapri mese" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Competenze sale" })).toHaveCount(0);
  });

  test("mese corrente: prepublish (messaggio, no griglia, export disabilitati) oppure post-publish (griglia e link export)", async ({
    page,
  }) => {
    const email = process.env.E2E_SPECIALIZZANDO_EMAIL!.trim();
    const password = process.env.E2E_SPECIALIZZANDO_PASSWORD!;

    await loginWithEmailPassword(page, email, password);
    await page.goto("/turni");
    await expect(page.getByRole("heading", { name: "Piano turni del mese" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Approva mese" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pubblica turni" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Riapri mese" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Competenze sale" })).toHaveCount(0);

    const prepublish = page.getByText("Planning del mese in preparazione");
    const noPlan = page.getByText("Nessun planning per questo mese");
    const tutti = page.getByRole("button", { name: /^Tutti$/ });

    if (await prepublish.isVisible()) {
      await expect(tutti).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Esporta Excel" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Esporta Excel" })).toBeDisabled();
      await expect(page.getByRole("button", { name: /Genera PDF mensile/i })).toBeDisabled();
      await expect(page.getByRole("link", { name: /Vai a Ferie e richieste/i })).toBeVisible();
      return;
    }

    if (await noPlan.isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "Nessun piano per il mese corrente: skip asserzioni pre/post pubblicazione dettagliate.",
      });
      return;
    }

    await expect(page.getByText("Piano in database")).toBeVisible();
    await expect(tutti.first()).toBeVisible();
    await expect(page.getByRole("button", { name: planningMeButton })).toBeVisible();

    await expect(page.getByRole("link", { name: "Esporta Excel" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Esporta Excel" }).first()).toHaveAttribute(
      "href",
      /\/turni\/monthly-plan-excel\?month=\d{4}-\d{2}/,
    );

    const pdfLink = page.getByRole("link", { name: /Genera PDF mensile/i });
    const pdfDisabled = page.getByRole("button", { name: /Genera PDF mensile/i });
    if ((await pdfLink.count()) > 0) {
      await expect(pdfLink.first()).toHaveAttribute("href", /\/turni\/monthly-plan-pdf\?month=\d{4}-\d{2}/);
    } else {
      await expect(pdfDisabled).toBeDisabled();
    }
  });
});
