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

  if (!nome || !cargo) {
    return { erro: "Nome e cargo são obrigatórios." };
  }

  // Trava de valor negativo — validado aqui além do input min=0 no
  // client (que o usuário pode contornar digitando direto) e da CHECK
  // constraint no banco (última linha de defesa). As três camadas
  // juntas é o padrão certo, não redundância à toa.
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
 * Alterna o ponto: se há um registro sem saída, fecha ele (saida =
 * agora); senão, abre um novo (entrada = agora). É por isso que o
 * ponto conta progressivamente — enquanto está aberto, o resumo
 * calcula "agora - entrada" toda vez que é consultado.
 */
export async function baterPonto(funcionarioId: string): Promise<PontoState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

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
    return { emAberto: false };
  }

  const { error } = await supabase.from("registros_ponto").insert({
    restaurante_id: gerente.restauranteId,
    funcionario_id: funcionarioId,
    entrada: new Date().toISOString(),
  });
  if (error) return { erro: `Falha ao registrar entrada: ${error.message}` };
  revalidatePath("/escalas");
  return { emAberto: true };
}

export interface MarcarPagoState {
  erro?: string;
  sucesso?: boolean;
}

/**
 * Quita TUDO que está pendente (desde o último pagamento até agora) e
 * grava periodo_fim = agora. A próxima consulta de resumo só soma o
 * que acontecer depois disso — é isso que "zera" o saldo.
 */
export async function marcarComoPago(funcionarioId: string): Promise<MarcarPagoState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const resumo = await getResumoPagamento(funcionarioId, gerente.restauranteId);

  if (resumo.horasTrabalhadas === 0) {
    return { erro: "Não há horas pendentes para pagar." };
  }
  if (resumo.pontoEmAberto) {
    return { erro: "Feche o ponto em aberto (bata a saída) antes de marcar como pago." };
  }

  const agora = new Date().toISOString();

  const { error } = await supabase.from("pagamentos_historico").insert({
    restaurante_id: gerente.restauranteId,
    funcionario_id: funcionarioId,
    periodo_inicio: resumo.desde,
    periodo_fim: agora,
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