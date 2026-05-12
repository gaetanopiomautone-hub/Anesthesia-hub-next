-- Turni RLS: (1) blocchi planning — nessun specializzando legge gli slot altrui;
-- (2) telefoni assignee via policy turni — solo con piano approvato e pubblicato (published_at).

drop policy if exists "trainee_planning_blocks_select_planning_roles" on public.trainee_planning_blocks;
create policy "trainee_planning_blocks_select_planning_roles"
on public.trainee_planning_blocks
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or (public.is_specializzando() and user_id = auth.uid())
);

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
      and p.published_at is not null
      and si.assigned_to is not null
  )
);
