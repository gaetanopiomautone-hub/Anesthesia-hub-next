-- Profiles + specializzandi_profiles refactor (idempotent).
-- Requires public.set_updated_at() (creato anche qui come replace per install isolate).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ENUM: assegnazione_specializzando
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assegnazione_specializzando') then
    create type public.assegnazione_specializzando as enum (
      'rianimazione',
      'sala_base',
      'sala_locoregionale',
      'sala_avanzata'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- profiles: nome, cognome, telefono; migrate da full_name; rimuovi legacy
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists nome text;
alter table public.profiles add column if not exists cognome text;
alter table public.profiles add column if not exists telefono text;

-- Backfill da full_name quando presente
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
  ) then
    execute $mig$
      update public.profiles p
      set
        nome = coalesce(nullif(trim(split_part(trim(p.full_name), ' ', 1)), ''), ''),
        cognome = coalesce(
          nullif(
            trim(substring(trim(p.full_name) from length(split_part(trim(p.full_name), ' ', 1)) + 2)),
            ''
          ),
          ''
        )
      where trim(coalesce(p.full_name, '')) <> ''
        and (p.nome is null or trim(p.nome) = '')
    $mig$;
  end if;
end$$;

update public.profiles set nome = coalesce(nullif(trim(nome), ''), '') where nome is null;
update public.profiles set cognome = coalesce(nullif(trim(cognome), ''), '') where cognome is null;

alter table public.profiles alter column nome set default '';
alter table public.profiles alter column cognome set default '';

update public.profiles set nome = '' where nome is null;
update public.profiles set cognome = '' where cognome is null;

alter table public.profiles alter column nome set not null;
alter table public.profiles alter column cognome set not null;

alter table public.profiles drop column if exists full_name;

-- ---------------------------------------------------------------------------
-- specializzandi_profiles + migrazione year_of_training
-- ---------------------------------------------------------------------------

create table if not exists public.specializzandi_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  anno_specialita int,
  assegnazione public.assegnazione_specializzando,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specializzandi_profiles_anno_check check (
    anno_specialita between 1 and 5
    or anno_specialita is null
  )
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'year_of_training'
  ) then
    insert into public.specializzandi_profiles (user_id, anno_specialita)
    select p.id, p.year_of_training
    from public.profiles p
    where p.role = 'specializzando'
      and p.year_of_training is not null
    on conflict (user_id) do update set
      anno_specialita = coalesce(
        excluded.anno_specialita,
        public.specializzandi_profiles.anno_specialita
      );
  end if;
end$$;

alter table public.profiles drop constraint if exists profiles_year_of_training_check;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'year_of_training'
  ) then
    alter table public.profiles drop column year_of_training;
  end if;
end$$;

create index if not exists specializzandi_profiles_assegnazione_idx
  on public.specializzandi_profiles (assegnazione)
  where assegnazione is not null;

drop trigger if exists specializzandi_profiles_set_updated_at on public.specializzandi_profiles;
create trigger specializzandi_profiles_set_updated_at
before update on public.specializzandi_profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- handle_new_user: metadata Supabase Auth (no password in public)
-- Expected raw_user_meta_data keys:
--   nome, cognome, telefono (optional strings)
--   role: admin | tutor | specializzando (optional; default specializzando)
--   anno_specialita (optional int 1–5), assegnazione (optional enum label)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := nullif(trim(meta ->> 'role'), '');
  resolved_role public.app_role := 'specializzando'::public.app_role;
  v_nome text := coalesce(nullif(trim(meta ->> 'nome'), ''), '');
  v_cognome text := coalesce(nullif(trim(meta ->> 'cognome'), ''), '');
  v_telefono text := nullif(trim(meta ->> 'telefono'), '');
  v_anno int;
  v_asseg_raw text := nullif(trim(meta ->> 'assegnazione'), '');
  v_asseg_enum public.assegnazione_specializzando;
begin
  if r in ('specializzando', 'admin', 'tutor') then
    resolved_role := r::public.app_role;
  end if;

  if v_nome = '' and v_cognome = '' and meta ? 'full_name' then
    v_nome := coalesce(nullif(trim(split_part(trim(meta ->> 'full_name'), ' ', 1)), ''), '');
    v_cognome := coalesce(
      nullif(
        trim(
          substring(
            trim(meta ->> 'full_name')
            from length(split_part(trim(meta ->> 'full_name'), ' ', 1)) + 2
          )
        ),
        ''
      ),
      ''
    );
  end if;

  insert into public.profiles (
    id,
    email,
    nome,
    cognome,
    telefono,
    role,
    is_active
  )
  values (
    new.id,
    coalesce(nullif(trim(new.email), ''), ''),
    v_nome,
    v_cognome,
    v_telefono,
    resolved_role,
    true
  )
  on conflict (id) do nothing;

  if resolved_role = 'specializzando'::public.app_role then
    begin
      v_anno :=
        case
          when nullif(trim(meta ->> 'anno_specialita'), '') is null then null
          else (trim(meta ->> 'anno_specialita'))::int
        end;
    exception
      when others then v_anno := null;
    end;

    v_asseg_enum := null;
    if v_asseg_raw is not null then
      begin
        v_asseg_enum := v_asseg_raw::public.assegnazione_specializzando;
      exception
        when others then v_asseg_enum := null;
      end;
    end if;

    if v_anno is not null and (v_anno < 1 or v_anno > 5) then
      v_anno := null;
    end if;

    if v_anno is not null or v_asseg_enum is not null then
      insert into public.specializzandi_profiles (
        user_id,
        anno_specialita,
        assegnazione
      )
      values (new.id, v_anno, v_asseg_enum)
      on conflict (user_id) do update set
        anno_specialita = coalesce(
          excluded.anno_specialita,
          public.specializzandi_profiles.anno_specialita
        ),
        assegnazione = coalesce(
          excluded.assegnazione,
          public.specializzandi_profiles.assegnazione
        ),
        updated_at = now();
    end if;
  end if;

  return new;
end;
$$;
