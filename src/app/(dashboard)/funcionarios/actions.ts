"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getResumoPagamento } from "@/lib/data/pagamentos";
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
  const pausaAlmocoMinutos = Number(formData.get("pausaAlmocoMinutos") ?? 30);
  const ehGerencia = formData.get("ehGerencia") === "on";

  if (!nome || !cargo) {
    return { erro: "Nome e cargo são obrigatórios." };
  }
  if (valorHoraRaw && Number(valorHoraRaw) < 0) {
    return { erro: "O valor/hora não pode ser negativo." };
  }
  if (pausaAlmocoMinutos < 0) {
    return { erro: "A pausa de almoço não pode ser negativa." };
  }

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
    pausa_almoco_minutos: pausaAlmocoMinutos,
    eh_gerencia: ehGerencia,
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
  revalidatePath("/funcionarios");
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
  revalidatePath("/funcionarios");
}

export async function getResumoPagamentoAction(funcionarioId: string): Promise<ResumoPagamento | { erro: string }> {
  const gerente = await requireGerente();
  try {
    return await getResumoPagamento(funcionarioId, gerente.restauranteId);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao calcular o resumo de pagamento." };
  }
}

export interface PontoState {
  erro?: string;
  emAberto?: boolean;
}

/**
 * Alterna o ponto: fecha se há um em aberto, senão abre um novo.
 * Trava dura: nunca permite bater ponto num dia em que o restaurante
 * está configurado como fechado (nem entrada nem saída).
 */
export async function baterPonto(funcionarioId: string): Promise<PontoState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const { data: restaurante } = await supabase
    .from("restaurantes")
    .select("dias_funcionamento")
    .eq("id", gerente.restauranteId)
    .single();

  const diasFuncionamento: number[] = restaurante?.dias_funcionamento ?? [0, 1, 2, 3, 4, 5, 6];
  const hoje = new Date();
  const diaSemanaHoje = (hoje.getUTCDay() + 6) % 7; // 0 = Segunda ... 6 = Domingo

  if (!diasFuncionamento.includes(diaSemanaHoje)) {
    return { erro: "O restaurante está fechado hoje — não é possível bater ponto." };
  }

  const { data: aberto } = await supabase
    .from("registros_ponto")
    .select("id")
    .eq("funcionario_id", funcionarioId)
    .is("saida", null)
    .maybeSingle();

  if (aberto) {
    const { error } = await supabase
      .from("registros_ponto")
      .update({ saida: new Date().toISOString() })
      .eq("id", aberto.id);
    if (error) return { erro: `Falha ao registrar saída: ${error.message}` };
    revalidatePath("/escalas");
    revalidatePath("/pagamentos");
    return { emAberto: false };
  }

  const { error } = await supabase.from("registros_ponto").insert({
    restaurante_id: gerente.restauranteId,
    funcionario_id: funcionarioId,
    entrada: new Date().toISOString(),
  });
  if (error) return { erro: `Falha ao registrar entrada: ${error.message}` };
  revalidatePath("/escalas");
  revalidatePath("/pagamentos");
  return { emAberto: true };
}

export interface MarcarPagoState {
  erro?: string;
  sucesso?: boolean;
}

/**
 * "Pagamento Feito" — marca pago=true em todos os pontos FECHADOS e
 * ainda não pagos desse funcionário. O ponto em andamento (se houver)
 * nunca é tocado aqui, porque a query filtra saida is not null; ele
 * só entra na quitação depois de fechado, na próxima vez.
 */
export async function marcarComoPago(funcionarioId: string): Promise<MarcarPagoState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const resumo = await getResumoPagamento(funcionarioId, gerente.restauranteId);

  if (resumo.horasFinalizadasNaoPagas === 0) {
    return { erro: "Não há horas finalizadas pendentes de pagamento." };
  }

  const { error: erroUpdate } = await supabase
    .from("registros_ponto")
    .update({ pago: true })
    .eq("funcionario_id", funcionarioId)
    .eq("pago", false)
    .not("saida", "is", null);

  if (erroUpdate) {
    console.error("[marcarComoPago] falha ao quitar pontos:", erroUpdate);
    return { erro: `Falha ao registrar pagamento: ${erroUpdate.message}` };
  }

  await supabase.from("pagamentos_historico").insert({
    restaurante_id: gerente.restauranteId,
    funcionario_id: funcionarioId,
    periodo_inicio: resumo.desdeMaisAntigo ?? new Date().toISOString(),
    periodo_fim: new Date().toISOString(),
    horas_trabalhadas: resumo.horasFinalizadasNaoPagas,
    valor_pago: resumo.valorFinalizadoNaoPago,
    pago_por: gerente.id,
  });

  revalidatePath("/escalas");
  revalidatePath("/pagamentos");
  return { sucesso: true };
}