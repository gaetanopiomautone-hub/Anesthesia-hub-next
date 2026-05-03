-- Integrità specializzando (anno + assegnazione obbligatori), admin/tutor senza riga dedicata.
-- Allinea handle_new_user e vincoli NOT NULL.

-- ---------------------------------------------------------------------------
-- Pulizia dati legacy prima di NOT NULL (idempotente)
-- ---------------------------------------------------------------------------

update public.specializzandi_profiles
set assegnazione = 'rianimazione'::public.assegnazione_specializzando
where assegnazione is null
  and anno_specialita is not null;

delete from public.specializzandi_profiles
where anno_specialita is null
   or assegnazione is null;

do $$
declare
  n int;
begin
  select count(*) into n
  from public.profiles p
  where p.role = 'specializzando'
    and not exists (
      select 1
      from public.specializzandi_profiles s
      where s.user_id = p.id
    );

  if n > 0 then
    raise exception
      'Migrazione bloccata: % profili con ruolo specializzando senza specializzandi_profiles. Completa i dati o converti il ruolo prima di applicare questa migrazione.',
      n;
  end if;
end$$;

alter table public.specializzandi_profiles
  drop constraint if exists specializzandi_profiles_anno_check;

alter table public.specializzandi_profiles
  add constraint specializzandi_profiles_anno_check check (anno_specialita between 1 and 5);

alter table public.specializzandi_profiles
  alter column anno_specialita set not null;

alter table public.specializzandi_profiles
  alter column assegnazione set not null;

-- ---------------------------------------------------------------------------
-- Trigger: da specializzando ad admin/tutor → elimina riga dedicata
-- ---------------------------------------------------------------------------

create or replace function public.profiles_strip_specializzandi_on_role_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.role = 'specializzando'
     and new.role in ('admin', 'tutor') then
    delete from public.specializzandi_profiles where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_strip_specializzandi_on_role_change on public.profiles;

create trigger profiles_strip_specializzandi_on_role_change
before update of role on public.profiles
for each row
execute function public.profiles_strip_specializzandi_on_role_change();

-- ---------------------------------------------------------------------------
-- Vincolo differito a fine transazione (stesso statement handle_new_user)
-- ---------------------------------------------------------------------------

create or replace function public.profiles_specializzando_integrity()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'specializzando' then
    if not exists (
      select 1
      from public.specializzandi_profiles sp
      where sp.user_id = new.id
    ) then
      raise exception 'specializzando richiede specializzandi_profiles (anno_specialita e assegnazione).';
    end if;
  elsif new.role in ('admin', 'tutor') then
    if exists (
      select 1
      from public.specializzandi_profiles sp
      where sp.user_id = new.id
    ) then
      raise exception 'ruolo % non ammette dati in specializzandi_profiles.', new.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_specializzando_integrity on public.profiles;

create constraint trigger profiles_specializzando_integrity
after insert or update of role on public.profiles
deferrable initially deferred
for each row
execute function public.profiles_specializzando_integrity();

-- ---------------------------------------------------------------------------
-- handle_new_user: specializzando obbligatorio anno+assegnazione; admin/tutor senza quei metadati
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
  meta_anno_nonempty boolean := nullif(trim(meta ->> 'anno_specialita'), '') is not null;
  meta_asseg_nonempty boolean := v_asseg_raw is not null;
begin
  if r in ('specializzando', 'admin', 'tutor') then
    resolved_role := r::public.app_role;
  end if;

  if resolved_role in ('admin', 'tutor') then
    if meta_anno_nonempty or meta_asseg_nonempty then
      raise exception
        'Metadati anno_specialita/assegnazione non ammessi per ruolo % (usare solo per specializzando).',
        resolved_role;
    end if;
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

    if v_anno is null or v_anno < 1 or v_anno > 5 or v_asseg_enum is null then
      raise exception
        'specializzando richiede nei metadati utente anno_specialita (1-5) e assegnazione valida (rianimazione|sala_base|sala_locoregionale|sala_avanzata).';
    end if;

    insert into public.specializzandi_profiles (
      user_id,
      anno_specialita,
      assegnazione
    )
    values (new.id, v_anno, v_asseg_enum)
    on conflict (user_id) do update set
      anno_specialita = excluded.anno_specialita,
      assegnazione = excluded.assegnazione,
      updated_at = now();
  end if;

  return new;
end;
$$;
