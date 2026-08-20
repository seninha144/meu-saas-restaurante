-- Preparação de dados para horários repartidos. A geração continua desativada.
alter table public.restaurantes
  add column if not exists permite_horario_repartido boolean not null default false;

alter table public.funcionarios
  add column if not exists aceita_horario_repartido boolean not null default false;
