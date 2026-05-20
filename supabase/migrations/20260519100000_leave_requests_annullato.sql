-- Aggiunge il valore enum 'annullato' solo se `leave_requests.status` è un tipo enum PostgreSQL.
-- Il nome del tipo può essere `approval_status`, `leave_request_status`, ecc.: non hardcodare un nome teorico.
--
-- Se questa revisione era già stata applicata (schema_migrations) con SQL diverso, Supabase non riesegue
-- questo file: usa `20260520110000_leave_requests_annullato_enum_repair.sql` (solo il blocco DO).

do $$
declare
  status_schema text;
  status_udt text;
begin
  select c.udt_schema, c.udt_name
  into status_schema, status_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'leave_requests'
    and c.column_name = 'status';

  if status_udt is null then
    raise notice 'leave_requests.status: colonna assente, skip alter type';
    return;
  end if;

  -- Se non è un enum (es. text / varchar), nessun ADD VALUE.
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = status_schema
      and t.typname = status_udt
      and t.typtype = 'e'
  ) then
    raise notice 'leave_requests.status udt=%.% (non enum), skip alter type', status_schema, status_udt;
    return;
  end if;

  execute format(
    'alter type %I.%I add value if not exists %L',
    status_schema,
    status_udt,
    'annullato'
  );
end$$;

alter table public.leave_requests drop constraint if exists leave_requests_approval_integrity;

alter table public.leave_requests
  add constraint leave_requests_approval_integrity check (
    (status = 'in_attesa' and reviewed_by is null and reviewed_at is null)
    or (status = 'annullato' and reviewed_by is null and reviewed_at is null)
    or (
      status in ('approvato', 'rifiutato')
      and reviewed_by is not null
      and reviewed_at is not null
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
  and status in ('in_attesa', 'annullato')
  and reviewed_by is null
  and reviewed_at is null
);
