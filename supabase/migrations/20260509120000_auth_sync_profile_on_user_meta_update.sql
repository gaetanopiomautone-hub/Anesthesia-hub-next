-- Sincronizza profiles / specializzandi_profiles anche su UPDATE di raw_user_meta_data:
-- alcuni progetti non espongono user_metadata completo alla funzione nell'AFTER INSERT.
-- Flusso app consigliato: createUser con ruolo bootstrap (tutor) + updateUserById con metadata finali.
-- profiles: upsert su conflict per riflettere email/nome/ruolo dopo l'update Auth.

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
  if tg_op = 'UPDATE' then
    if new.raw_user_meta_data is not distinct from old.raw_user_meta_data then
      return new;
    end if;
  end if;

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
  on conflict (id) do update set
    email = excluded.email,
    nome = excluded.nome,
    cognome = excluded.cognome,
    telefono = excluded.telefono,
    role = excluded.role,
    updated_at = now();

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
  else
    delete from public.specializzandi_profiles where user_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();
