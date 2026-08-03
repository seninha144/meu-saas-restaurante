"use server";

import { redirect } from "next/navigation";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  erro?: string;
}

export async function salvarConfiguracaoOperacional(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const diasFuncionamento: number[] = [];
  const horarios: {
    restaurante_id: string;
    dia_semana: number;
    fechado: boolean;
    hora_abertura: string | null;
    hora_fechamento: string | null;
  }[] = [];

  for (let dia = 0; dia < 7; dia++) {
    const aberto = formData.get(`aberto-${dia}`) === "on";
    if (aberto) diasFuncionamento.push(dia);

    horarios.push({
      restaurante_id: gerente.restauranteId,
      dia_semana: dia,
      fechado: !aberto,
      hora_abertura: aberto ? String(formData.get(`abertura-${dia}`) ?? "") || null : null,
      hora_fechamento: aberto ? String(formData.get(`fechamento-${dia}`) ?? "") || null : null,
    });
  }

  if (diasFuncionamento.length === 0) {
    return { erro: "Selecione pelo menos um dia de funcionamento." };
  }

  const coberturaFdsPrioritaria = formData.get("coberturaFdsPrioritaria") === "on";

  const { error: erroRestaurante } = await supabase
    .from("restaurantes")
    .update({
      dias_funcionamento: diasFuncionamento,
      cobertura_fds_prioritaria: coberturaFdsPrioritaria,
      onboarding_concluido: true,
    })
    .eq("id", gerente.restauranteId);

  if (erroRestaurante) {
    return { erro: `Falha ao salvar configuração: ${erroRestaurante.message}` };
  }

  // upsert pelos 7 dias — unique(restaurante_id, dia_semana) garante idempotência
  const { error: erroHorarios } = await supabase
    .from("horarios_funcionamento")
    .upsert(horarios, { onConflict: "restaurante_id,dia_semana" });

  if (erroHorarios) {
    return { erro: `Falha ao salvar horários: ${erroHorarios.message}` };
  }

  redirect("/escalas");
}