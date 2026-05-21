-- Distinct `congresso` on leave_requests (form "Congresso" was mapped to `desiderata`).

do $$
declare
  type_schema text;
  type_name text;
begin
  select n.nspname, t.typname
  into type_schema, type_name
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'leave_request_type'
    and t.typtype = 'e';

  if type_name is null then
    raise notice 'leave_request_type enum assente, skip add value congresso';
    return;
  end if;

  execute format(
    'alter type %I.%I add value if not exists %L',
    type_schema,
    type_name,
    'congresso'
  );
end$$;
