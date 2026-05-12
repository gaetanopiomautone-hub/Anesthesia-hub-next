-- Garantisce policy UPDATE admin su `shift_items` e `monthly_shift_plans` quando si applica solo la catena migrazioni.
-- `shift_items_update_admin` / `monthly_shift_plans_update_admin` sono in `supabase/policies.sql` per reset locale ma
-- non comparivano in migrazioni precedenti a 20260511280000; dopo il drop delle policy specializzando il DB poteva
-- restare senza alcuna UPDATE su `shift_items` (RLS blocca tutto, 0 righe, nessun errore PostgREST).

drop policy if exists "monthly_shift_plans_update_admin" on public.monthly_shift_plans;
create policy "monthly_shift_plans_update_admin"
on public.monthly_shift_plans
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "shift_items_update_admin" on public.shift_items;
create policy "shift_items_update_admin"
on public.shift_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
