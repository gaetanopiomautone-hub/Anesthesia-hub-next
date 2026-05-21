-- Repair idempotente se `20260521110000_leave_requests_admin_cancel_approved.sql` non è su produzione.

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
      and cancelled_at is not null
      and (
        (reviewed_by is null and reviewed_at is null)
        or (reviewed_by is not null and reviewed_at is not null)
      )
    )
    or (
      status in ('approvato', 'rifiutato')
      and reviewed_by is not null
      and reviewed_at is not null
      and cancelled_at is null
    )
  );

drop policy if exists "leave_update_scheduler_admin_cancel" on public.leave_requests;

create policy "leave_update_scheduler_admin_cancel"
on public.leave_requests
for update
to authenticated
using (
  public.is_scheduler_or_admin()
  and status in ('in_attesa', 'approvato')
)
with check (
  public.is_scheduler_or_admin()
  and status = 'annullato'
  and cancelled_at is not null
);
