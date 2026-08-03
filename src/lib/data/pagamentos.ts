import { createClient } from "@/lib/supabase/server";
import { toISODate } from "@/lib/dates";
import type { FrequenciaPagamento, ResumoPagamento } from "@/types/dominio";

const HORAS_POR_TURNO = 8;

/** Meia-noite UTC do dia de `data` (zera hora/min/seg, mas em UTC, não local). */
function utcMeiaNoite(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

/** Calcula [cicloInicio, cicloFim] (ambos incluídos) contendo `hoje`, em UTC. */
function calcularCiclo(frequencia: FrequenciaPagamento, hoje: Date): { inicio: Date; fim: Date } {
  const d = utcMeiaNoite(hoje);

  switch (frequencia) {
    case "dia":
      return { inicio: d, fim: d };

    case "semana": {
      const diaISO = (d.getUTCDay() + 6) % 7; // 0 = Segunda
      const inicio = new Date(d);
      inicio.setUTCDate(inicio.getUTCDate() - diaISO);
      const fim = new Date(inicio);
      fim.setUTCDate(fim.getUTCDate() + 6);
      return { inicio, fim };
    }

    case "quinzena": {
      const primeiraMetade = d.getUTCDate() <= 15;
      const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), primeiraMetade ? 1 : 16));
      const fim = primeiraMetade
        ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15))
        : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      return { inicio, fim };
    }

    case "mes": {
      const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      return { inicio, fim };
    }
  }
}

export async function getResumoPagamento(funcionarioId: string, restauranteId: string): Promise<ResumoPagamento> {
  const supabase = await createClient();

  const [{ data: funcionario }, { data: restaurante }] = await Promise.all([
    supabase.from("funcionarios").select("valor_hora, frequencia_pagamento").eq("id", funcionarioId).single(),
    supabase.from("restaurantes").select("valor_hora_padrao, frequencia_pagamento_padrao").eq("id", restauranteId).single(),
  ]);

  const frequencia: FrequenciaPagamento =
    (funcionario?.frequencia_pagamento as FrequenciaPagamento | null) ??
    (restaurante?.frequencia_pagamento_padrao as FrequenciaPagamento) ??
    "mes";
  const valorHora = Number(funcionario?.valor_hora ?? restaurante?.valor_hora_padrao ?? 0);

  const { inicio, fim } = calcularCiclo(frequencia, new Date());
  const cicloInicioISO = toISODate(inicio);
  const cicloFimISO = toISODate(fim);

  const inicioComFolga = new Date(inicio);
  inicioComFolga.setUTCDate(inicioComFolga.getUTCDate() - 6);

  const { data: escalas } = await supabase
    .from("escalas")
    .select("id, semana_inicio")
    .eq("restaurante_id", restauranteId)
    .gte("semana_inicio", toISODate(inicioComFolga))
    .lte("semana_inicio", cicloFimISO);

  let horasTrabalhadas = 0;

  if (escalas && escalas.length > 0) {
    const { data: turnos } = await supabase
      .from("turnos")
      .select("escala_id, dia_semana")
      .eq("funcionario_id", funcionarioId)
      .in(
        "escala_id",
        escalas.map((e) => e.id)
      );

    for (const turno of turnos ?? []) {
      const escala = escalas.find((e) => e.id === turno.escala_id)!;
      // semana_inicio vem do banco como "YYYY-MM-DD" — parseamos como
      // UTC explicitamente (acrescentando T00:00:00Z) pra não deixar o
      // motor de JS interpretar em horário local.
      const dataTurno = new Date(`${escala.semana_inicio}T00:00:00Z`);
      dataTurno.setUTCDate(dataTurno.getUTCDate() + turno.dia_semana);

      if (dataTurno >= inicio && dataTurno <= fim) {
        horasTrabalhadas += HORAS_POR_TURNO;
      }
    }
  }

  const { data: pagamentoExistente } = await supabase
    .from("pagamentos_historico")
    .select("id")
    .eq("funcionario_id", funcionarioId)
    .eq("ciclo_inicio", cicloInicioISO)
    .eq("ciclo_fim", cicloFimISO)
    .maybeSingle();

  return {
    frequencia,
    cicloInicio: cicloInicioISO,
    cicloFim: cicloFimISO,
    horasTrabalhadas,
    valorHora,
    valorTotal: Math.round(horasTrabalhadas * valorHora * 100) / 100,
    jaPago: !!pagamentoExistente,
  };
}