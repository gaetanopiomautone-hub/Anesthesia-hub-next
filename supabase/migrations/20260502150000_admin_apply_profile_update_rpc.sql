-- Aggiorna profilo + ruolo + specializzandi in un'unica transazione (es. tutor → specializzando).
-- Solo service_role deve poterla chiamare (server action Admin).

create or replace function public.admin_apply_profile_update(
  p_user_id uuid,
  p_nome text,
  p_cognome text,
  p_telefono text,
  p_email text,
  p_is_active boolean,
  p_role public.app_role,
  p_anno int,
  p_asseg public.assegnazione_specializzando
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('specializzando'::public.app_role, 'admin'::public.app_role, 'tutor'::public.app_role) then
    raise exception 'Ruolo non valido.';
  end if;

  if p_role = 'specializzando'::public.app_role then
    if p_anno is null or p_anno < 1 or p_anno > 5 or p_asseg is null then
      raise exception 'specializzando richiede anno_specialita (1–5) e assegnazione.';
    end if;
  end if;

  if coalesce(nullif(trim(p_nome), ''), '') = '' or coalesce(nullif(trim(p_cognome), ''), '') = '' then
    raise exception 'Nome e cognome obbligatori.';
  end if;

  update public.profiles
  set
    nome = trim(p_nome),
    cognome = trim(p_cognome),
    telefono = nullif(trim(p_telefono), ''),
    email = lower(nullif(trim(p_email), '')),
    is_active = p_is_active,
    role = p_role,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Utente non trovato.';
  end if;

  if lower(nullif(trim(p_email), '')) is null then
    raise exception 'Email obbligatoria.';
  end if;

  if p_role = 'specializzando'::public.app_role then
    insert into public.specializzandi_profiles as sp (user_id, anno_specialita, assegnazione)
    values (p_user_id, p_anno, p_asseg)
    on conflict (user_id) do update set
      anno_specialita = excluded.anno_specialita,
      assegnazione = excluded.assegnazione,
      updated_at = now();
  else
    delete from public.specializzandi_profiles where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.admin_apply_profile_update(
  uuid, text, text, text, text, boolean,
  public.app_role, integer, public.assegnazione_specializzando
)
from PUBLIC;

revoke execute on function public.admin_apply_profile_update(
  uuid, text, text, text, text, boolean,
  public.app_role, integer, public.assegnazione_specializzando
)
from anon, authenticated;

grant execute on function public.admin_apply_profile_update(
  uuid, text, text, text, text, boolean,
  public.app_role, integer, public.assegnazione_specializzando
)
to service_role;
