-- Chi ha accesso alla turnistica può leggere i profili degli specializzandi che risultano
-- assegnati su almeno un piano mensile APPROVATO (nome/cognome/email/telefono per PDF e viste coerenti).
-- Si affianca a profiles_select_own_or_admin (OR tra policy permissive).

drop policy if exists "profiles_select_turni_assignees_on_approved_plan" on public.profiles;

create policy "profiles_select_turni_assignees_on_approved_plan"
on public.profiles
for select
to authenticated
using (
  profiles.role = 'specializzando'
  and coalesce(profiles.is_active, true) = true
  and (public.is_admin() or public.is_tutor() or public.is_specializzando())
  and exists (
    select 1
    from public.shift_items si
    inner join public.monthly_shift_plans p on p.id = si.plan_id
    where si.assigned_to = profiles.id
      and p.status = 'approved'
      and si.assigned_to is not null
  )
);
