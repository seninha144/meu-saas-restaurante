"use server";

import { redirect } from "next/navigation";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NIVEIS_MOVIMENTO, PERIODOS_OPERACIONAIS } from "@/types/dominio";

export interface OnboardingState {
  erro?: string;
}

type MovimentoOperacionalInput = {
  dia_semana: number;
  periodo: string;
  nivel: "baixo" | "normal" | "alto" | "muito_alto";
};

type NecessidadeEquipeInput = {
  dia_semana: number;
  periodo: string;
  zona_id?: string | null;
  funcao?: string | null;
  minimo: number;
  ideal: number;
  maximo: number;
};

function lerJson<T>(formData: FormData, campo: string): T[] {
  const valor = formData.get(campo);

  if (!valor) return [];

  try {
    const dados = JSON.parse(String(valor));
    return Array.isArray(dados) ? dados : [];
  } catch {
    throw new Error(`Dados inválidos em ${campo}.`);
  }
}

function validarMovimentos(
  movimentos: MovimentoOperacionalInput[]
): string | null {
  for (const movimento of movimentos) {
    if (
      !Number.isInteger(movimento.dia_semana) ||
      movimento.dia_semana < 0 ||
      movimento.dia_semana > 6
    ) {
      return "Dia da semana inválido na configuração de movimento.";
    }

    if (
      !(PERIODOS_OPERACIONAIS as string[]).includes(movimento.periodo)
    ) {
      return "Período inválido na configuração de movimento.";
    }

    if (
      !(NIVEIS_MOVIMENTO as string[]).includes(movimento.nivel)
    ) {
      return "Nível de movimento inválido.";
    }
  }

  return null;
}

function validarNecessidades(
  necessidades: NecessidadeEquipeInput[]
): string | null {
  for (const necessidade of necessidades) {
    if (
      !Number.isInteger(necessidade.dia_semana) ||
      necessidade.dia_semana < 0 ||
      necessidade.dia_semana > 6
    ) {
      return "Dia da semana inválido na necessidade de equipa.";
    }

    if (
      !(PERIODOS_OPERACIONAIS as string[]).includes(necessidade.periodo)
    ) {
      return "Período inválido na necessidade de equipa.";
    }

    if (
      !Number.isInteger(necessidade.minimo) ||
      !Number.isInteger(necessidade.ideal) ||
      !Number.isInteger(necessidade.maximo) ||
      necessidade.minimo < 0 ||
      necessidade.ideal < necessidade.minimo ||
      necessidade.maximo < necessidade.ideal
    ) {
      return "Os valores mínimo, ideal e máximo da equipa são inválidos.";
    }

    if (necessidade.zona_id !== undefined && necessidade.zona_id !== null) {
      if (!necessidade.zona_id.trim()) {
        return "Zona inválida na necessidade de equipa.";
      }
    }
  }

  return null;
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

    if (aberto) {
      diasFuncionamento.push(dia);
    }

    horarios.push({
      restaurante_id: gerente.restauranteId,
      dia_semana: dia,
      fechado: !aberto,
      hora_abertura: aberto
        ? String(formData.get(`abertura-${dia}`) ?? "") || null
        : null,
      hora_fechamento: aberto
        ? String(formData.get(`fechamento-${dia}`) ?? "") || null
        : null,
    });
  }

  if (diasFuncionamento.length === 0) {
    return { erro: "Selecione pelo menos um dia de funcionamento." };
  }

  let movimentos: MovimentoOperacionalInput[] = [];
  let necessidades: NecessidadeEquipeInput[] = [];

  try {
    movimentos = lerJson<MovimentoOperacionalInput>(
      formData,
      "movimentosOperacionais"
    );

    necessidades = lerJson<NecessidadeEquipeInput>(
      formData,
      "necessidadesEquipe"
    );
  } catch (error) {
    return {
      erro:
        error instanceof Error
          ? error.message
          : "Os dados operacionais enviados são inválidos.",
    };
  }

  const erroMovimentos = validarMovimentos(movimentos);

  if (erroMovimentos) {
    return { erro: erroMovimentos };
  }

  const erroNecessidades = validarNecessidades(necessidades);

  if (erroNecessidades) {
    return { erro: erroNecessidades };
  }

  const coberturaFdsPrioritaria =
    formData.get("coberturaFdsPrioritaria") === "on";

  const { error: erroRestaurante } = await supabase
    .from("restaurantes")
    .update({
      dias_funcionamento: diasFuncionamento,
      cobertura_fds_prioritaria: coberturaFdsPrioritaria,
      onboarding_concluido: true,
    })
    .eq("id", gerente.restauranteId);

  if (erroRestaurante) {
    return {
      erro: `Falha ao salvar configuração: ${erroRestaurante.message}`,
    };
  }

  // Upsert pelos 7 dias — unique(restaurante_id, dia_semana)
  // garante idempotência.
  const { error: erroHorarios } = await supabase
    .from("horarios_funcionamento")
    .upsert(horarios, {
      onConflict: "restaurante_id,dia_semana",
    });

  if (erroHorarios) {
    return {
      erro: `Falha ao salvar horários: ${erroHorarios.message}`,
    };
  }

  // O onboarding envia sempre o estado completo de movimento e
  // necessidade de equipa (o formulário reflete tudo que está
  // configurado no momento). Por isso limpamos e regravamos as duas
  // tabelas a cada envio — assim uma linha removida na UI também é
  // removida no banco, e não fica "presa" de um envio anterior.
  const { error: erroLimpezaMovimentos } = await supabase
    .from("movimento_operacional")
    .delete()
    .eq("restaurante_id", gerente.restauranteId);

  if (erroLimpezaMovimentos) {
    return {
      erro: `Falha ao atualizar movimento operacional: ${erroLimpezaMovimentos.message}`,
    };
  }

  if (movimentos.length > 0) {
    const movimentosParaSalvar = movimentos.map((movimento) => ({
      restaurante_id: gerente.restauranteId,
      dia_semana: movimento.dia_semana,
      periodo: movimento.periodo.trim(),
      nivel: movimento.nivel,
    }));

    const { error: erroMovimentos } = await supabase
      .from("movimento_operacional")
      .insert(movimentosParaSalvar);

    if (erroMovimentos) {
      return {
        erro: `Falha ao salvar movimento operacional: ${erroMovimentos.message}`,
      };
    }
  }

  const { error: erroLimpezaNecessidades } = await supabase
    .from("necessidades_equipe")
    .delete()
    .eq("restaurante_id", gerente.restauranteId);

  if (erroLimpezaNecessidades) {
    return {
      erro: `Falha ao atualizar necessidades de equipa: ${erroLimpezaNecessidades.message}`,
    };
  }

  if (necessidades.length > 0) {
    const necessidadesParaSalvar = necessidades.map((necessidade) => ({
      restaurante_id: gerente.restauranteId,
      dia_semana: necessidade.dia_semana,
      periodo: necessidade.periodo.trim(),
      zona_id: necessidade.zona_id ?? null,
      funcao: necessidade.funcao?.trim() || null,
      minimo: necessidade.minimo,
      ideal: necessidade.ideal,
      maximo: necessidade.maximo,
    }));

    const { error: erroNecessidades } = await supabase
      .from("necessidades_equipe")
      .insert(necessidadesParaSalvar);

    if (erroNecessidades) {
      return {
        erro: `Falha ao salvar necessidades de equipa: ${erroNecessidades.message}`,
      };
    }
  }

  redirect("/escalas");
}