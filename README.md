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

## Note sicurezza

- Non registrare dati identificativi dei pazienti
- Usare solo identificativi interni di reparto e metadati formativi
- Rafforzare le policy RLS prima del go-live
