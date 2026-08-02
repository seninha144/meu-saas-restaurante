import { createClient } from "@/lib/supabase/server";
import type { FrequenciaPagamento, ResumoPagamento, Zona } from "@/types/dominio";

const HORAS_POR_TURNO = 8; // mesma estimativa usada em getFuncionarios

export async function getZonas(restauranteId: string): Promise<Zona[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zonas")
    .select("id, restaurante_id, nome, cor, ordem, capacidade_minima")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) throw new Error(`Falha ao buscar zonas: ${error.message}`);

  return (data ?? []).map((z) => ({
    id: z.id,
    restauranteId: z.restaurante_id,
    nome: z.nome,
    cor: z.cor,
    ordem: z.ordem,
    capacidadeMinima: z.capacidade_minima,
  }));
}

export async function getRestaurante(restauranteId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes")
    .select(
      "id, nome, pais, moeda, usa_zonas, plano, max_funcionarios, permite_ia, status_assinatura, trial_ends_at, valor_hora_padrao, frequencia_pagamento_padrao"
    )
    .eq("id", restauranteId)
    .single();

  if (error || !data) throw new Error(`Falha ao buscar restaurante: ${error?.message}`);

  return {
    id: data.id,
    nome: data.nome,
    pais: data.pais as "BR" | "PT",
    moeda: data.moeda as "BRL" | "EUR",
    usaZonas: data.usa_zonas as boolean,
    plano: data.plano as "trial" | "basico" | "pro",
    maxFuncionarios: data.max_funcionarios as number,
    permiteIA: data.permite_ia as boolean,
    statusAssinatura: data.status_assinatura as "trial" | "active" | "canceled",
    trialEndsAt: data.trial_ends_at as string,
    valorHoraPadrao: Number(data.valor_hora_padrao),
    frequenciaPagamentoPadrao: data.frequencia_pagamento_padrao as "dia" | "semana" | "quinzena" | "mes",
  };
}

/** Calcula [cicloInicio, cicloFim] (ambos incluídos) contendo `hoje`, pra uma frequência dada. */
function calcularCiclo(frequencia: FrequenciaPagamento, hoje: Date): { inicio: Date; fim: Date } {
  const d = new Date(hoje);
  d.setHours(0, 0, 0, 0);

  switch (frequencia) {
    case "dia":
      return { inicio: d, fim: d };

    case "semana": {
      const diaISO = (d.getDay() + 6) % 7; // 0 = Segunda
      const inicio = new Date(d);
      inicio.setDate(inicio.getDate() - diaISO);
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 6);
      return { inicio, fim };
    }

    case "quinzena": {
      // quinzena "corrida": dias 1-15 e 16-fim do mês
      const primeiraMetade = d.getDate() <= 15;
      const inicio = new Date(d.getFullYear(), d.getMonth(), primeiraMetade ? 1 : 16);
      const fim = primeiraMetade
        ? new Date(d.getFullYear(), d.getMonth(), 15)
        : new Date(d.getFullYear(), d.getMonth() + 1, 0); // dia 0 do mês seguinte = último dia deste mês
      return { inicio, fim };
    }

    case "mes": {
      const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { inicio, fim };
    }
  }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
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

  // escalas cuja semana toca o ciclo (com folga de 6 dias pra pegar
  // semanas que começam antes do ciclo mas têm dias dentro dele)
  const inicioComFolga = new Date(inicio);
  inicioComFolga.setDate(inicioComFolga.getDate() - 6);

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
      const dataTurno = new Date(escala.semana_inicio);
      dataTurno.setDate(dataTurno.getDate() + turno.dia_semana);

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