-- Limites seguros para horas extras usadas somente pela geração automática.
alter table public.restaurantes
  add column if not exists permite_horas_extras boolean not null default false,
  add column if not exists limite_horas_extras_semanais numeric not null default 0;

alter table public.funcionarios
  add column if not exists aceita_horas_extras boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurantes_horas_extras_validas'
      and conrelid = 'public.restaurantes'::regclass
  ) then
    alter table public.restaurantes
      add constraint restaurantes_horas_extras_validas check (
        (permite_horas_extras = false and limite_horas_extras_semanais = 0)
        or
        (permite_horas_extras = true and limite_horas_extras_semanais in (1, 2))
      );
  end if;
end $$;
