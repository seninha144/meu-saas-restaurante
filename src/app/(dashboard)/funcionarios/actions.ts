"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getResumoPagamento } from "@/lib/data/queries";
import type { ResumoPagamento } from "@/types/dominio";

export interface FuncionarioFormState {
  erro?: string;
  sucesso?: boolean;
}

function lerDisponibilidade(formData: FormData) {
  const linhas: { diaSemana: number; disponivel: boolean; periodo: string | null }[] = [];
  for (let dia = 0; dia < 7; dia++) {
    const indisponivel = formData.get(`indisponivel-${dia}`) === "on";
    if (indisponivel) {
      linhas.push({ diaSemana: dia, disponivel: false, periodo: null });
      continue;
    }
    for (const periodo of ["Manhã", "Tarde", "Noite", "Fechamento"]) {
      if (formData.get(`disp-${dia}-${periodo}`) === "on") {
        linhas.push({ diaSemana: dia, disponivel: true, periodo });
      }
    }
  }
  return linhas;
}

export async function salvarFuncionario(
  _prevState: FuncionarioFormState,
  formData: FormData
): Promise<FuncionarioFormState> {
  const gerente = await requireGerente();

  if (!gerente.restauranteId) {
    console.error("[salvarFuncionario] gerente sem restauranteId:", gerente);
    return { erro: "Sua conta não está vinculada a um restaurante. Contate o administrador." };
  }

  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const cargo = String(formData.get("cargo") ?? "").trim();
  const zonaId = String(formData.get("zonaId") ?? "") || null;
  const idadeRaw = String(formData.get("idade") ?? "");
  const genero = String(formData.get("genero") ?? "") || null;
  const cargaHorariaSemanalMax = Number(formData.get("cargaHorariaSemanalMax") ?? 44);
  const folgasObrigatorias = Number(formData.get("folgasObrigatorias") ?? 2);
  const valorHoraRaw = String(formData.get("valorHora") ?? "");
  const frequenciaPagamento = String(formData.get("frequenciaPagamento") ?? "") || null;

  if (!nome || !cargo) {
    return { erro: "Nome e cargo são obrigatórios." };
  }

  // Limite do plano — só checa em criação (id vazio); editar um
  // funcionário existente nunca deveria esbarrar nesse teto.
  if (!id) {
    const { count } = await supabase
      .from("funcionarios")
      .select("id", { count: "exact", head: true })
      .eq("restaurante_id", gerente.restauranteId)
      .eq("ativo", true);

    const { data: restaurante } = await supabase
      .from("restaurantes")
      .select("max_funcionarios")
      .eq("id", gerente.restauranteId)
      .single();

    if (restaurante && (count ?? 0) >= restaurante.max_funcionarios) {
      return {
        erro: `Seu plano permite até ${restaurante.max_funcionarios} funcionários ativos. Desative alguém ou faça upgrade pra cadastrar mais.`,
      };
    }
  }

  const payload = {
    restaurante_id: gerente.restauranteId,
    nome,
    cargo,
    zona_id: zonaId,
    idade: idadeRaw ? Number(idadeRaw) : null,
    genero,
    carga_horaria_semanal_max: cargaHorariaSemanalMax,
    folgas_obrigatorias_semana: folgasObrigatorias,
    valor_hora: valorHoraRaw ? Number(valorHoraRaw) : null,
    frequencia_pagamento: frequenciaPagamento,
    tipo_contrato: "full_time" as const,
    modalidade_pagamento: "mes" as const,
  };

  const { data: funcionario, error } = id
    ? await supabase.from("funcionarios").update(payload).eq("id", id).select("id").single()
    : await supabase.from("funcionarios").insert(payload).select("id").single();

  if (error || !funcionario) {
    return { erro: `Falha ao salvar funcionário: ${error?.message}` };
  }

  await supabase.from("disponibilidades").delete().eq("funcionario_id", funcionario.id);
  const linhas = lerDisponibilidade(formData);
  if (linhas.length > 0) {
    await supabase.from("disponibilidades").insert(
      linhas.map((l) => ({
        restaurante_id: gerente.restauranteId,
        funcionario_id: funcionario.id,
        dia_semana: l.diaSemana,
        disponivel: l.disponivel,
        periodo: l.periodo,
      }))
    );
  }

  revalidatePath("/escalas");
  return { sucesso: true };
}

export async function desativarFuncionario(funcionarioId: string): Promise<void> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  await supabase
    .from("funcionarios")
    .update({ ativo: false })
    .eq("id", funcionarioId)
    .eq("restaurante_id", gerente.restauranteId);

  revalidatePath("/escalas");
}

/** Chamada direta pelo client (FuncionarioModal) pra popular o card de pagamento ao abrir a ficha. */
export async function getResumoPagamentoAction(funcionarioId: string): Promise<ResumoPagamento | { erro: string }> {
  const gerente = await requireGerente();
  try {
    return await getResumoPagamento(funcionarioId, gerente.restauranteId);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao calcular o resumo de pagamento." };
  }
}

export interface MarcarPagoState {
  erro?: string;
  sucesso?: boolean;
}

/**
 * Grava a quitação em pagamentos_historico. A unique constraint em
 * (funcionario_id, ciclo_inicio, ciclo_fim) impede duplicar o
 * pagamento do mesmo ciclo — se já existir, o insert falha e a gente
 * trata como "já estava pago" em vez de erro.
 */
export async function marcarComoPago(funcionarioId: string): Promise<MarcarPagoState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const resumo = await getResumoPagamento(funcionarioId, gerente.restauranteId);
  if (resumo.jaPago) {
    return { sucesso: true };
  }

  const { error } = await supabase.from("pagamentos_historico").insert({
    restaurante_id: gerente.restauranteId,
    funcionario_id: funcionarioId,
    ciclo_inicio: resumo.cicloInicio,
    ciclo_fim: resumo.cicloFim,
    horas_trabalhadas: resumo.horasTrabalhadas,
    valor_pago: resumo.valorTotal,
    pago_por: gerente.id,
  });

  if (error) {
    console.error("[marcarComoPago] falha ao gravar quitação:", error);
    return { erro: `Falha ao registrar pagamento: ${error.message}` };
  }

  revalidatePath("/escalas");
  return { sucesso: true };
}