-- Pubblicazione turni (distinta dall’approvazione): data e autore pubblicazione.
alter table public.monthly_shift_plans
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles (id) on delete set null;

comment on column public.monthly_shift_plans.published_at is
  'Quando il coordinamento ha pubblicato ufficialmente i turni al reparto (solo con status approved).';
comment on column public.monthly_shift_plans.published_by is
  'Profilo admin che ha eseguito la pubblicazione.';
