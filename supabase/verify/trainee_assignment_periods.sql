-- Verifica manuale post-migration (SQL Editor Supabase).
-- 1) Tabella e vincolo overlap
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trainee_assignment_periods'
order by ordinal_position;

select conname
from pg_constraint
where conrelid = 'public.trainee_assignment_periods'::regclass
  and contype = 'x';

-- 2) Policy RLS (select admin/tutor/own)
select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'trainee_assignment_periods';
