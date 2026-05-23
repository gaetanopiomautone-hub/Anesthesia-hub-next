-- Logbook formativo: catalogo a 3 livelli + quantità + ruolo partecipazione.

do $$
begin
  create type public.logbook_participation_role as enum (
    'osservato',
    'assistito',
    'eseguito_supervisionato',
    'eseguito_autonomamente'
  );
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- procedure_catalog: categoria → procedura → sottotipo
-- ---------------------------------------------------------------------------

alter table public.procedure_catalog
  add column if not exists procedure_name text,
  add column if not exists subtype text;

update public.procedure_catalog
set procedure_name = coalesce(nullif(trim(procedure_name), ''), nullif(trim(name), ''))
where procedure_name is null or trim(procedure_name) = '';

update public.procedure_catalog
set subtype = coalesce(subtype, '');

alter table public.procedure_catalog
  alter column procedure_name set not null;

alter table public.procedure_catalog
  alter column subtype set default '';

update public.procedure_catalog set subtype = '' where subtype is null;

alter table public.procedure_catalog
  alter column subtype set not null;

create or replace function public.sync_procedure_catalog_display_name()
returns trigger
language plpgsql
as $$
begin
  new.name :=
    trim(new.procedure_name)
    || case
      when new.subtype is not null and trim(new.subtype) <> '' then ' — ' || trim(new.subtype)
      else ''
    end;
  return new;
end;
$$;

drop trigger if exists procedure_catalog_sync_name on public.procedure_catalog;
create trigger procedure_catalog_sync_name
before insert or update of procedure_name, subtype on public.procedure_catalog
for each row execute function public.sync_procedure_catalog_display_name();

-- Allinea name sulle righe esistenti
update public.procedure_catalog
set procedure_name = procedure_name;

alter table public.procedure_catalog drop constraint if exists procedure_catalog_name_key;

create unique index if not exists procedure_catalog_category_procedure_subtype_uidx
  on public.procedure_catalog (category, procedure_name, subtype);

-- ---------------------------------------------------------------------------
-- logbook_entries: quantità + ruolo formativo
-- ---------------------------------------------------------------------------

alter table public.logbook_entries
  add column if not exists quantity int not null default 1,
  add column if not exists participation_role public.logbook_participation_role;

alter table public.logbook_entries
  drop constraint if exists logbook_entries_quantity_check;

alter table public.logbook_entries
  add constraint logbook_entries_quantity_check check (quantity >= 1);

update public.logbook_entries
set participation_role = case
  when autonomy_level = 'autonomo'::public.autonomy_level then 'eseguito_autonomamente'::public.logbook_participation_role
  when autonomy_level = 'con_supervisione'::public.autonomy_level then 'eseguito_supervisionato'::public.logbook_participation_role
  when autonomy_level = 'assistito'::public.autonomy_level then 'assistito'::public.logbook_participation_role
  else 'osservato'::public.logbook_participation_role
end
where participation_role is null;

alter table public.logbook_entries
  alter column participation_role set not null;

-- Tutor: lettura voci logbook (portfolio formativo)
drop policy if exists "logbook_select_own_or_admin" on public.logbook_entries;
create policy "logbook_select_own_admin_tutor"
on public.logbook_entries
for select
to authenticated
using (
  trainee_profile_id = auth.uid()
  or public.is_admin()
  or public.is_tutor()
);

-- ---------------------------------------------------------------------------
-- Catalogo procedure (seed idempotente)
-- ---------------------------------------------------------------------------

insert into public.procedure_catalog (category, procedure_name, subtype, description, active)
values
  ('Intubazione', 'Laringoscopia diretta', '', null, true),
  ('Intubazione', 'Fibroscopica', '', null, true),
  ('Intubazione', 'Videolaringoscopia', '', null, true),
  ('Accesso venoso centrale', 'Femorale', '', null, true),
  ('Accesso venoso centrale', 'Giugulare', '', null, true),
  ('Accesso venoso centrale', 'Succlavia', '', null, true),
  ('Accesso arterioso', 'Femorale', '', null, true),
  ('Accesso arterioso', 'Radiale', '', null, true),
  ('Accesso arterioso', 'Omerale', '', null, true),
  ('Anestesia neuroassiale', 'Spinale', '', null, true),
  ('Anestesia neuroassiale', 'Peridurale', '', null, true),
  ('Anestesia neuroassiale', 'Spino-peridurale', '', null, true),
  ('Monitoraggio emodinamico', 'Swan Ganz', '', null, true),
  ('Blocchi di fascia', 'ESP Block', '', null, true),
  ('Blocchi di fascia', 'TAP Block', '', null, true),
  ('Blocchi di fascia', 'Rectus Sheath', '', null, true),
  ('Blocchi perinervosi', 'Interscalenico', '', null, true),
  ('Blocchi perinervosi', 'Sovraclaveare', '', null, true),
  ('Blocchi perinervosi', 'Ascellare', '', null, true),
  ('Blocchi perinervosi', 'Femorale', '', null, true),
  ('Blocchi perinervosi', 'PENG', '', null, true),
  ('Blocchi perinervosi', 'Fascia iliaca', '', null, true),
  ('Blocchi perinervosi', 'Sciatico', 'Sottogluteo', null, true),
  ('Blocchi perinervosi', 'Sciatico', 'Popliteo', null, true),
  ('Blocchi perinervosi', 'Sciatico', 'Via anteriore', null, true),
  ('Blocchi perinervosi', 'Ankle Block', '', null, true),
  ('Blocchi perinervosi', 'Otturatorio', '', null, true)
on conflict (category, procedure_name, subtype) do update
  set active = true, description = coalesce(excluded.description, public.procedure_catalog.description);

-- name popolato dal trigger su insert; forza sync su righe appena inserite senza trigger fired
update public.procedure_catalog pc
set procedure_name = pc.procedure_name
where pc.name is null or trim(pc.name) = '';

-- Disattiva catalogo demo/legacy piatto
update public.procedure_catalog
set active = false
where category in ('Vie aeree', 'Accessi', 'Anestesia loco-regionale');
