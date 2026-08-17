-- Capacidade/responsabilidade operacional, independente da preferência de turno.
alter table public.funcionarios
  add column if not exists pode_abertura boolean not null default true,
  add column if not exists pode_fechamento boolean not null default true;
