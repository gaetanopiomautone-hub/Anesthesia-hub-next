# Anesthesia Hub

Gestionale web MVP per specializzandi di anestesia del Policlinico San Donato, costruito con `Next.js`, `TypeScript`, `Tailwind CSS` e predisposizione `Supabase`.

## Stack

- `Next.js` App Router
- `TypeScript`
- `Tailwind CSS`
- `Supabase` per auth, database PostgreSQL e RLS

## Ruoli supportati

- `admin`
- `tutor`
- `specializzando`

## Funzionalita' MVP

- Login con Supabase Auth (email/password) e profilo applicativo in `public.profiles`
- Dashboard dedicata per ruolo
- Calendario turni con sala operatoria / rianimazione
- Ferie e desiderata con workflow di approvazione
- Impegni universitari nel calendario
- Archivio didattico con PDF e link
- Logbook procedure senza dati paziente
- Report per settimana, mese e bimestre

## Struttura cartelle

```txt
src/
  app/
    (auth)/login/
    (app)/dashboard/
    (app)/turni/
    (app)/ferie/
    (app)/universita/
    (app)/archivio/
    (app)/logbook/
    (app)/report/
    api/demo/seed/
  components/
    forms/
    layout/
    ui/
  lib/
    auth/
    data/
    supabase/
    utils/
supabase/
  schema.sql
  seed.sql
types/
  database.ts
```

## Deploy (es. Vercel) e PDF turni

- **PDF mensile** (`/turni/monthly-plan-pdf`): la route dichiara `runtime = "nodejs"` ed è compatibile con **Vercel** (funzione Node, non Edge). In `next.config.ts` è impostato `serverExternalPackages: ["pdfkit"]` così il bundler non incorpora binari/font opzionali di `pdfkit` in modo fragile.
- **RLS `profiles`**: per leggere `telefono` (e nome) degli specializzandi **non** autenticati come admin, applicare la migrazione `20260511240000_profiles_select_turni_pdf_assignees.sql` (policy `profiles_select_turni_assignees_on_approved_plan`). Senza di essa, solo l’admin vede i numeri altrui; tutor/specializzando vedrebbero `n/d` per i colleghi.
- **Intestazione PDF**: in produzione impostare `NEXT_PUBLIC_PLANNING_ORG_LABEL` (Vercel → Settings → Environment Variables) con nome scuola/reparto, es. `Scuola di specializzazione in Anestesia e Rianimazione — …`.

## Competenze sale (Blocco 6) — migrazione e RLS

1. **Migrazione**: applicare `supabase/migrations/20260511250000_trainee_location_competencies.sql` sul progetto (Dashboard Supabase → SQL, oppure `supabase db push` / pipeline CI se usate Supabase CLI collegata al remote).
2. **RLS — verifica manuale** (dopo deploy policy da `supabase/policies.sql` o dalla stessa migrazione):
   - **Admin**: da `/admin/trainee-competencies` inserire ed eliminare righe; oppure `insert`/`select` su `trainee_assignment_location_competencies` con utente admin.
   - **Tutor**: `select * from trainee_assignment_location_competencies` deve restituire tutte le righe visibili (solo lettura).
   - **Specializzando**: la stessa `select` deve restituire **solo** le righe con `trainee_id` uguale al proprio `auth.uid()`; righe altrui assenti.
3. **Select turni**: le opzioni mostrano solo codici corti (`·pref`, `·rot`, `·abil`, `·!`); il dettaglio è nel **tooltip** nativo (`title` sull’`<option>`), così la lista resta leggibile con molti nominativi.

## Database Supabase

Tabelle principali:

- `profiles`
- `clinical_locations`
- `shifts`
- `leave_requests`
- `university_events`
- `learning_resources`
- `procedure_catalog`
- `logbook_entries`
- `trainee_assignment_location_competencies` (competenze / rotazioni per sala o area tipo)

Vincoli applicati:

- ruoli tramite `enum`
- approvazioni tramite `enum`
- anonimizzazione logbook con `check (patient_reference is null)`
- permessi via `RLS`

## Actions / API previste

- `src/app/(auth)/login/actions.ts`
- `src/app/(app)/ferie/actions.ts`
- `src/app/(app)/logbook/actions.ts`
- `src/app/api/demo/seed/route.ts`

## Seed demo

`supabase/seed.sql` include:

- 4 utenti demo, uno per ruolo
- 3 sedi cliniche
- 3 procedure catalogo
- turni, ferie, eventi universitari, risorse e logbook iniziali

## Avvio locale

1. Installa le dipendenze con `npm install`
2. Crea `.env.local` a partire da `.env.example`
3. Avvia con `npm run dev`

## Test E2E (Playwright)

Coprono in modo **minimo** i moduli **Turni** e **Ferie**:

- **Turni**: login, barra planning sticky (link mese prec/succ + filtri), flusso opzionale approvazione/pubblicazione/riapertura per admin, **comportamento specializzando** (mese fittizio senza piano; mese corrente pre/post pubblicazione), `href` di PDF/Excel (senza validare il binario).
- **Ferie (specializzando)**: login → `/ferie?month=2026-07` → click giorno 15 → verifica `startDate`/`endDate` → submit → redirect `ok=created` → stato «In attesa»; secondo test overlap sullo stesso periodo (`errorCode=overlap`, nessun messaggio 42501). Test opzionale su maggio 2026 se esiste overlap con dati seed.

### Prerequisiti browser

Dopo `npm install`, una tantum (browser nella cartella del progetto grazie a `PLAYWRIGHT_BROWSERS_PATH` di default in `playwright.config.ts`):

```bash
npm run e2e:install
```

### Variabili d’ambiente

| Variabile | Obbligo | Descrizione |
|-----------|---------|-------------|
| `PLAYWRIGHT_BASE_URL` | Opzionale | Default `http://127.0.0.1:3000` |
| `PLAYWRIGHT_START_SERVER` | Opzionale | Se `1`, avvia `npm run dev` prima dei test |
| `E2E_ADMIN_EMAIL` | Per test admin | Email Supabase (nessuna password in repo) |
| `E2E_ADMIN_PASSWORD` | Per test admin | Password dell’utente admin di test |
| `E2E_SPECIALIZZANDO_EMAIL` | Per test permessi / ferie | Email utente `specializzando` |
| `E2E_SPECIALIZZANDO_PASSWORD` | Per test permessi / ferie | Password |
| `SUPABASE_SERVICE_ROLE_KEY` | Per test **Ferie** seriali | Cleanup idempotente su `2026-07-15` prima del run |

Se mancano le coppie admin o specializzando, il relativo test viene **saltato** (`skipped`), non fallisce.

`playwright.config.ts` carica `.env.local` / `.env` con `@next/env` (come Next.js), quindi puoi definire lì le `E2E_*` senza esportarle nel shell. In alternativa esportale esplicitamente nel terminale che lancia Playwright.

### Comandi

```bash
# App già in esecuzione su PLAYWRIGHT_BASE_URL
npm run e2e

# Con UI interattiva
npm run e2e:ui

# Avvio automatico di next dev (richiede .env.local valido per l’app)
PLAYWRIGHT_START_SERVER=1 npm run e2e
```

Report HTML: cartella `playwright-report/` dopo l’esecuzione.

## Test unitari (Vitest)

Contratti e logica pura (nessun browser). Tra gli altri:

- parser RPC `turni_shift_plan_month_state`
- **schema guard** `leave_requests` (`src/lib/domain/leave-requests-schema-guard*.test.ts`): fallisce se mapper/SQL/policy divergono dal contratto in `leave-requests-db-contract.ts`
- con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, il guard integrazione verifica anche le colonne reali via PostgREST

```bash
npm run test:unit
```

### Limiti noti

- Senza le variabili `E2E_*` i blocchi Turni/Ferie sono **skipped** (exit 0) e **non** avviano il browser.
- I test **Ferie** seriali richiedono anche `SUPABASE_SERVICE_ROLE_KEY`: prima del run eliminano eventuali richieste su `2026-07-15` per l’utente E2E, poi creano la richiesta e verificano l’overlap. Usare un utente specializzando di test.
- I test **admin** modificano lo stato del piano del **mese corrente** (URL `/turni` senza `?month=`) quando eseguono approva/pubblica/riapri: usare un progetto di test o un mese dedicato; il blocco **specializzando** sul mese corrente dipende da quello stato (pre o post pubblicazione).
- Il test specializzando su **`/turni?month=2099-01`** non dipende dai dati reali (nessun piano atteso).
- Nessun piano per il mese (admin): il test admin salta le fasi approve/publish e resta verde.
- Non si valida il contenuto dei file PDF/XLSX scaricati.
- `playwright.config.ts` forza `PLAYWRIGHT_BROWSERS_PATH=0` se la variabile punta a una cache vuota (es. alcuni agent). Se `npm run e2e:install` non scarica nulla, eseguire manualmente `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium` con rete stabile.

## Note sicurezza

- Non registrare dati identificativi dei pazienti
- Usare solo identificativi interni di reparto e metadati formativi
- Rafforzare le policy RLS prima del go-live
