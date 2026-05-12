-- Turni: specializzando legge piani e righe solo dopo pubblicazione (approved + published_at).
-- Admin/tutor: SELECT invariato. Rimossi UPDATE specializzando su piano/righe (planning interno = solo admin).

drop policy if exists "monthly_shift_plans_select_all_roles" on public.monthly_shift_plans;
create policy "monthly_shift_plans_select_all_roles"
on public.monthly_shift_plans
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or (
    public.is_specializzando()
    and status = 'approved'
    and published_at is not null
  )
);

drop policy if exists "shift_items_select_all_roles" on public.shift_items;
create policy "shift_items_select_all_roles"
on public.shift_items
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or (
    public.is_specializzando()
    and exists (
      select 1
      from public.monthly_shift_plans p
      where p.id = shift_items.plan_id
        and p.status = 'approved'
        and p.published_at is not null
    )
  )
);

drop policy if exists "monthly_shift_plans_update_specializzando_non_approved" on public.monthly_shift_plans;
drop policy if exists "shift_items_update_specializzando_draft_only" on public.shift_items;

-- Metadati mese per UI specializzando quando il piano non è leggibile via RLS (bozza / non pubblicato).
create or replace function public.turni_shift_plan_month_state(plan_year integer, plan_month integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.monthly_shift_plans p where p.year = plan_year and p.month = plan_month
    ) then
      '{"variant":"none"}'::jsonb
    when exists (
      select 1
      from public.monthly_shift_plans p
      where p.year = plan_year
        and p.month = plan_month
        and p.status = 'approved'
        and p.published_at is not null
    ) then
      '{"variant":"published"}'::jsonb
    else
      coalesce(
        (
          select jsonb_build_object(
            'variant', 'internal',
            'plan_id', p.id,
            'plan_status', p.status::text
          )
          from public.monthly_shift_plans p
          where p.year = plan_year and p.month = plan_month
          order by p.created_at desc nulls last
          limit 1
        ),
        '{"variant":"none"}'::jsonb
      )
  end;
$$;

revoke all on function public.turni_shift_plan_month_state(integer, integer) from public;
grant execute on function public.turni_shift_plan_month_state(integer, integer) to authenticated;
