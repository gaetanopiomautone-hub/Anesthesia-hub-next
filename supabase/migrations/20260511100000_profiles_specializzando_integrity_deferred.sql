-- Allinea il trigger di integrità al comportamento documentato in 20260502140000:
-- deve essere DEFERRABLE INITIALLY DEFERRED così la validazione avviene a fine transazione,
-- dopo che handle_new_user ha fatto upsert su profiles e insert su specializzandi_profiles.
--
-- Se il trigger è stato creato senza DEFERRABLE (o ricreato a mano), l'UPDATE su profiles a
-- specializzando fallisce prima dell'insert su specializzandi_profiles → rollback completo e
-- nessuna riga in public.profiles coerente con auth.users.
--
-- Verifica operativa (SQL Editor), prima e dopo questa migration:
--   select tgname, tgdeferrable, tginitdeferred
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname = 'profiles'
--     and not t.tgisinternal
--     and tgname = 'profiles_specializzando_integrity';
-- Drift tipico: tgdeferrable = f e tginitdeferred = f. Dopo apply: entrambi devono essere t.

drop trigger if exists profiles_specializzando_integrity on public.profiles;

create constraint trigger profiles_specializzando_integrity
after insert or update of role on public.profiles
deferrable initially deferred
for each row
execute function public.profiles_specializzando_integrity();
