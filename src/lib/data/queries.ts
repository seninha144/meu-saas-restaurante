import { createClient } from "@/lib/supabase/server";
import type { Restaurante, Zona } from "@/types/dominio";

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

/**
 * Cargos/funções já usados nos funcionários deste restaurante, sem
 * duplicatas. Serve para sugerir (não obrigar) as mesmas funções na
 * configuração de necessidade de equipa do onboarding — evita que o
 * mesmo cargo seja digitado de formas diferentes em lugares diferentes.
 */
export async function getCargosExistentes(
  restauranteId: string
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funcionarios")
    .select("cargo")
    .eq("restaurante_id", restauranteId);

  if (error) throw new Error(`Falha ao buscar cargos: ${error.message}`);

  const cargos = new Set(
    (data ?? [])
      .map((f) => f.cargo?.trim())
      .filter((cargo): cargo is string => !!cargo)
  );

  return Array.from(cargos).sort((a, b) => a.localeCompare(b, "pt"));
}

export async function getRestaurante(restauranteId: string): Promise<Restaurante> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes")
    .select(
      "id, nome, pais, moeda, usa_zonas, plano, max_funcionarios, permite_ia, permite_horario_repartido, permite_horas_extras, limite_horas_extras_semanais, status_assinatura, trial_ends_at, valor_hora_padrao, frequencia_pagamento_padrao, onboarding_concluido, dias_funcionamento, cobertura_fds_prioritaria, ponto_automatico"
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
    permiteHorarioRepartido: data.permite_horario_repartido ?? false,
    permiteHorasExtras: data.permite_horas_extras ?? false,
    limiteHorasExtrasSemanais: data.permite_horas_extras
      ? Number(data.limite_horas_extras_semanais)
      : 0,
    statusAssinatura: data.status_assinatura as "trial" | "active" | "canceled",
    trialEndsAt: data.trial_ends_at as string,
    valorHoraPadrao: Number(data.valor_hora_padrao),
    frequenciaPagamentoPadrao: data.frequencia_pagamento_padrao as "dia" | "semana" | "quinzena" | "mes",
    onboardingConcluido: data.onboarding_concluido as boolean,
    diasFuncionamento: (data.dias_funcionamento as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
    coberturaFdsPrioritaria: data.cobertura_fds_prioritaria as boolean,
    pontoAutomatico: data.ponto_automatico ?? false,
  };
}
