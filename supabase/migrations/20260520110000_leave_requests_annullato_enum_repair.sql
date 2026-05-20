-- Repair: idempotente. Usa se `20260519100000_leave_requests_annullato.sql` era già
-- registrata come applicata con la versione che faceva `alter type public.approval_status ...`
-- su un DB dove l'enum reale ha un altro nome (o `status` è text: in quel caso questo blocco no-op).
-- Per ambienti freschi, il DO è già incluso in 191: eseguire di nuovo qui non cambia nulla (IF NOT EXISTS).

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
