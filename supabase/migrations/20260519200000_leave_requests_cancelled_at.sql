alter table public.leave_requests
  add column if not exists cancelled_at timestamptz;

alter table public.leave_requests drop constraint if exists leave_requests_approval_integrity;

alter table public.leave_requests
  add constraint leave_requests_approval_integrity check (
    (
      status = 'in_attesa'
      and reviewed_by is null
      and reviewed_at is null
      and cancelled_at is null
    )
    or (
      status = 'annullato'
      and reviewed_by is null
      and reviewed_at is null
      and cancelled_at is not null
    )
    or (
      status in ('approvato', 'rifiutato')
      and reviewed_by is not null
      and reviewed_at is not null
      and cancelled_at is null
    )
  );

drop policy if exists "leave_update_own_only_pending" on public.leave_requests;

create policy "leave_update_own_only_pending"
on public.leave_requests
for update
to authenticated
using (
  user_id = auth.uid()
  and status = 'in_attesa'
)
with check (
  user_id = auth.uid()
  and reviewed_by is null
  and reviewed_at is null
  and (
    (status = 'in_attesa' and cancelled_at is null)
    or (status = 'annullato' and cancelled_at is not null)
  )
);
