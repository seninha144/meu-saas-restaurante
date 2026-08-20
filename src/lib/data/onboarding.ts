import { createClient } from "@/lib/supabase/server";
import type {
  HorarioFuncionamento,
  MovimentoOperacional,
  NecessidadeEquipe,
  NivelMovimento,
  PeriodoOperacional,
} from "@/types/dominio";
import { NIVEIS_MOVIMENTO, PERIODOS_OPERACIONAIS } from "@/types/dominio";

export interface ConfiguracaoOnboarding {
  horarios: HorarioFuncionamento[];
  coberturaFdsPrioritaria: boolean;
  permiteHorarioRepartido: boolean;
  permiteHorasExtras: boolean;
  limiteHorasExtrasSemanais: number;
  movimentos: MovimentoOperacional[];
  necessidades: NecessidadeEquipe[];
}

function comoNivelMovimento(valor: string): NivelMovimento {
  return (NIVEIS_MOVIMENTO as string[]).includes(valor)
    ? (valor as NivelMovimento)
    : "normal";
}

function comoPeriodoOperacional(
  valor: string
): PeriodoOperacional | null {
  return (PERIODOS_OPERACIONAIS as string[]).includes(valor)
    ? (valor as PeriodoOperacional)
    : null;
}

/**
 * Busca tudo que já foi salvo do onboarding operacional, para que a
 * página possa ser reaberta/reeditada sem perder o que já existe.
 * Se nada foi configurado ainda, devolve arrays vazios e os defaults
 * de um restaurante novo (todos os dias abertos, sem horário definido).
 */
export async function getConfiguracaoOnboarding(
  restauranteId: string
): Promise<ConfiguracaoOnboarding> {
  const supabase = await createClient();

  const [
    { data: restauranteRaw },
    { data: horariosRaw },
    { data: movimentosRaw },
    { data: necessidadesRaw },
  ] = await Promise.all([
    supabase
      .from("restaurantes")
      .select("cobertura_fds_prioritaria, permite_horario_repartido, permite_horas_extras, limite_horas_extras_semanais")
      .eq("id", restauranteId)
      .single(),
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
      .select(
        "dia_semana, periodo, zona_id, funcao, minimo, ideal, maximo"
      )
      .eq("restaurante_id", restauranteId),
  ]);

  const horariosPorDia = new Map(
    (horariosRaw ?? []).map((h) => [h.dia_semana, h])
  );

  const horarios: HorarioFuncionamento[] = Array.from(
    { length: 7 },
    (_, dia) => {
      const existente = horariosPorDia.get(dia);

      return {
        diaSemana: dia,
        fechado: existente?.fechado ?? false,
        horaAbertura: existente?.hora_abertura?.slice(0, 5) ?? null,
        horaFechamento: existente?.hora_fechamento?.slice(0, 5) ?? null,
      };
    }
  );

  const movimentos: MovimentoOperacional[] = (movimentosRaw ?? [])
    .map((m) => {
      const periodo = comoPeriodoOperacional(m.periodo);
      if (!periodo) return null;

      return {
        diaSemana: m.dia_semana,
        periodo,
        nivel: comoNivelMovimento(m.nivel),
      };
    })
    .filter((m): m is MovimentoOperacional => m !== null);

  const necessidades: NecessidadeEquipe[] = (necessidadesRaw ?? [])
    .map((n) => {
      const periodo = comoPeriodoOperacional(n.periodo);
      if (!periodo) return null;

      return {
        diaSemana: n.dia_semana,
        periodo,
        zonaId: n.zona_id,
        funcao: n.funcao,
        minimo: n.minimo,
        ideal: n.ideal,
        maximo: n.maximo,
      };
    })
    .filter((n): n is NecessidadeEquipe => n !== null);

  return {
    horarios,
    coberturaFdsPrioritaria:
      restauranteRaw?.cobertura_fds_prioritaria ?? true,
    permiteHorarioRepartido:
      restauranteRaw?.permite_horario_repartido ?? false,
    permiteHorasExtras: restauranteRaw?.permite_horas_extras ?? false,
    limiteHorasExtrasSemanais: restauranteRaw?.permite_horas_extras
      ? Number(restauranteRaw.limite_horas_extras_semanais)
      : 0,
    movimentos,
    necessidades,
  };
}
