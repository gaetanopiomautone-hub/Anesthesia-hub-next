-- logbook_entries: policy compatibili con user_id legacy quando la colonna esiste.

do $$
declare
  has_user_id boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'logbook_entries'
      and column_name = 'user_id'
  ) into has_user_id;

  drop policy if exists "logbook_select_own_or_admin" on public.logbook_entries;
  drop policy if exists "logbook_select_own_admin_tutor" on public.logbook_entries;
  drop policy if exists "logbook_insert_own" on public.logbook_entries;
  drop policy if exists "logbook_update_own" on public.logbook_entries;
  drop policy if exists "logbook_delete_own" on public.logbook_entries;

  if has_user_id then
    create policy "logbook_select_own_admin_tutor"
    on public.logbook_entries
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or trainee_profile_id = auth.uid()
      or public.is_admin()
      or public.is_tutor()
    );

    create policy "logbook_insert_own"
    on public.logbook_entries
    for insert
    to authenticated
    with check (
      user_id = auth.uid()
      or trainee_profile_id = auth.uid()
    );

    create policy "logbook_update_own"
    on public.logbook_entries
    for update
    to authenticated
    using (
      user_id = auth.uid()
      or trainee_profile_id = auth.uid()
    )
    with check (
      user_id = auth.uid()
      or trainee_profile_id = auth.uid()
    );

    create policy "logbook_delete_own"
    on public.logbook_entries
    for delete
    to authenticated
    using (
      user_id = auth.uid()
      or trainee_profile_id = auth.uid()
    );
  else
    create policy "logbook_select_own_admin_tutor"
    on public.logbook_entries
    for select
    to authenticated
    using (
      trainee_profile_id = auth.uid()
      or public.is_admin()
      or public.is_tutor()
    );

    create policy "logbook_insert_own"
    on public.logbook_entries
    for insert
    to authenticated
    with check (trainee_profile_id = auth.uid());

    create policy "logbook_update_own"
    on public.logbook_entries
    for update
    to authenticated
    using (trainee_profile_id = auth.uid())
    with check (trainee_profile_id = auth.uid());

    create policy "logbook_delete_own"
    on public.logbook_entries
    for delete
    to authenticated
    using (trainee_profile_id = auth.uid());
  end if;
end
$$;
