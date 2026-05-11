-- RLS hardening: solo public.profiles e public.specializzandi_profiles (SELECT).
-- Sostituisce le policy "own + tutor/admin" con "own + admin" usando current_user_is_admin().
-- Nota: i tutor non leggono più l’anagrafica altrui via PostgREST su `profiles`; se serve (es. turni),
--       introdurre una RPC security definer o flussi solo admin.
-- Rimuove anche le policy permissive legacy (*_scheduler_*) così il restringimento abbia effetto
-- (altrimenti due policy SELECT in OR lascerebbero ai tutor l’accesso completo).

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true)
  );
$$;

grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "profiles_select_own_scheduler_admin" on public.profiles;
drop policy if exists profiles_select_own_or_admin on public.profiles;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "specializzandi_profiles_select_own_or_scheduler_admin" on public.specializzandi_profiles;
drop policy if exists specializzandi_profiles_select_own_or_admin on public.specializzandi_profiles;

create policy specializzandi_profiles_select_own_or_admin
on public.specializzandi_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_admin()
);
