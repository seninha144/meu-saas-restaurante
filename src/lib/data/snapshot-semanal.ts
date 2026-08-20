import type { SupabaseClient } from "@supabase/supabase-js";
import { toISODate } from "@/lib/dates";
import {
  normalizarSnapshotSemanal,
  type EntradaSnapshotSemanal,
  type SnapshotSemanal,
} from "@/lib/escalas/snapshot-semanal";
import type { Database } from "@/types/database.types";

type RestauranteRaw = EntradaSnapshotSemanal["restaurante"];
type EscalaRaw = EntradaSnapshotSemanal["escala"];

export async function criarSnapshotSemanal(
  supabase: SupabaseClient<Database>,
  restauranteId: string,
  escala: EscalaRaw,
  restaurante: RestauranteRaw,
  agoraReferencia: Date = new Date()
): Promise<SnapshotSemanal> {
  const inicioHistorico = new Date(`${escala.semana_inicio}T00:00:00Z`);
  inicioHistorico.setUTCDate(inicioHistorico.getUTCDate() - 28);

  const [
    { data: turnosExistentes, error: erroTurnosExistentes },
    { data: escalasHistoricas, error: erroEscalasHistoricas },
    { data: zonas },
    { data: funcionarios },
    { data: disponibilidades },
    { data: horarios },
    { data: movimentos },
    { data: necessidades },
  ] = await Promise.all([
    supabase
      .from("turnos")
      .select("id, funcionario_id, zona_id, dia_semana, periodo, hora_inicio, hora_fim")
      .eq("escala_id", escala.id)
      .eq("restaurante_id", restauranteId),
    supabase
      .from("escalas")
      .select("id, semana_inicio")
      .eq("restaurante_id", restauranteId)
      .gte("semana_inicio", toISODate(inicioHistorico))
      .lt("semana_inicio", escala.semana_inicio),
    supabase
      .from("zonas")
      .select("id, capacidade_minima")
      .eq("restaurante_id", restauranteId)
      .eq("ativo", true),
    supabase
      .from("funcionarios")
      .select("id, cargo, zona_id, carga_horaria_semanal_max, folgas_obrigatorias_semana, pausa_almoco_minutos, pode_abertura, pode_fechamento, aceita_horario_repartido, aceita_horas_extras")
      .eq("restaurante_id", restauranteId)
      .eq("ativo", true),
    supabase
      .from("disponibilidades")
      .select("funcionario_id, dia_semana, disponivel, periodo")
      .eq("restaurante_id", restauranteId),
    supabase
      .from("horarios_funcionamento")
      .select("dia_semana, fechado, hora_abertura, hora_fechamento")
      .eq("restaurante_id", restauranteId),
    supabase
      .from("movimento_operacional")
      .select("dia_semana, periodo, nivel")
      .eq("restaurante_id", restauranteId),
    supabase
      .from("necessidades_equipe")
      .select("dia_semana, periodo, zona_id, funcao, minimo, ideal, maximo")
      .eq("restaurante_id", restauranteId),
  ]);

  if (erroTurnosExistentes) {
    throw new Error(`Falha ao consultar a escala: ${erroTurnosExistentes.message}`);
  }
  if (erroEscalasHistoricas) {
    throw new Error(`Falha ao consultar o histórico de escalas: ${erroEscalasHistoricas.message}`);
  }

  const idsHistoricos = (escalasHistoricas ?? []).map((item) => item.id);
  const { data: turnosHistoricos, error: erroTurnosHistoricos } = idsHistoricos.length
    ? await supabase
        .from("turnos")
        .select("escala_id, funcionario_id, dia_semana, periodo, hora_inicio, hora_fim")
        .in("escala_id", idsHistoricos)
        .eq("restaurante_id", restauranteId)
    : { data: [], error: null };

  if (erroTurnosHistoricos) {
    throw new Error(`Falha ao consultar turnos históricos: ${erroTurnosHistoricos.message}`);
  }

  return normalizarSnapshotSemanal({
    restaurante,
    escala,
    horarios: horarios ?? [],
    zonas: zonas ?? [],
    funcionarios: funcionarios ?? [],
    disponibilidades: disponibilidades ?? [],
    movimentos: movimentos ?? [],
    necessidades: necessidades ?? [],
    turnosExistentes: turnosExistentes ?? [],
    escalasHistoricas: escalasHistoricas ?? [],
    turnosHistoricos: turnosHistoricos ?? [],
    agoraReferencia: agoraReferencia.toISOString(),
  });
}
