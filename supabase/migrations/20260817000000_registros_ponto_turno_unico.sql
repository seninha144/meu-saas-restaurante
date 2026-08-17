-- Um turno pode originar no máximo um registro de ponto, mesmo com crons concorrentes.
create unique index if not exists registros_ponto_turno_id_unico
  on public.registros_ponto (turno_id)
  where turno_id is not null;
