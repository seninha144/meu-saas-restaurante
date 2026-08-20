"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getResumoPagamento } from "@/lib/data/pagamentos";
import type {
  PeriodoDisponibilidade,
  ResumoPagamento,
} from "@/types/dominio";

export interface FuncionarioFormState {
  erro?: string;
  sucesso?: boolean;
}

// Função auxiliar para extrair mensagem de erro Supabase
function getErrorMessage(error: unknown): string {
  if (!error) return "Erro desconhecido";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Erro desconhecido";
}

function lerDisponibilidade(formData: FormData): {
  diaSemana: number;
  disponivel: boolean;
  periodo: PeriodoDisponibilidade | null;
}[] {
  const linhas: {
    diaSemana: number;
    disponivel: boolean;
    periodo: PeriodoDisponibilidade | null;
  }[] = [];

  for (let dia = 0; dia < 7; dia++) {
    if (formData.get(`indisponivel-${dia}`) === "on") {
      linhas.push({
        diaSemana: dia,
        disponivel: false,
        periodo: null,
      });

      continue;
    }

    const periodosDodia: PeriodoDisponibilidade[] = [];

    for (const periodo of [
      "Manhã",
      "Tarde",
      "Fechamento",
      "Total",
    ] as const) {
      if (formData.get(`disp-${dia}-${periodo}`) === "on") {
        periodosDodia.push(periodo);
      }
    }

    if (periodosDodia.length > 0) {
      periodosDodia.forEach((periodo) => {
        linhas.push({
          diaSemana: dia,
          disponivel: true,
          periodo,
        });
      });
    } else {
      linhas.push({
        diaSemana: dia,
        disponivel: false,
        periodo: null,
      });
    }
  }

  return linhas;
}

export async function salvarFuncionario(
  _prevState: FuncionarioFormState,
  formData: FormData
): Promise<FuncionarioFormState> {
  try {
    const gerente = await requireGerente();

    if (!gerente.restauranteId) {
      return {
        erro: "Sua conta não está vinculada a um restaurante.",
      };
    }

    const supabase = await createClient();

    const id = String(formData.get("id") ?? "");
    const nome = String(formData.get("nome") ?? "").trim();
    const cargo = String(formData.get("cargo") ?? "").trim();
    const zonaId = String(formData.get("zonaId") ?? "") || null;
    const idadeRaw = String(formData.get("idade") ?? "");
    const genero = String(formData.get("genero") ?? "") || null;

    const cargaHorariaSemanalMax = Number(
      formData.get("cargaHorariaSemanalMax") ?? 44
    );

    const folgasObrigatorias = Number(
      formData.get("folgasObrigatorias") ?? 2
    );

    const valorHoraRaw = String(formData.get("valorHora") ?? "").trim();
    const valorHora = valorHoraRaw
      ? Number(valorHoraRaw.replace(",", "."))
      : null;

    const frequenciaPagamento =
      String(formData.get("frequenciaPagamento") ?? "") || null;

    const pausaAlmocoMinutos = Number(
      formData.get("pausaAlmocoMinutos") ?? 30
    );

    const ehGerencia = formData.get("ehGerencia") === "on";
    const podeAbertura = formData.get("podeAbertura") === "on";
    const podeFechamento = formData.get("podeFechamento") === "on";
    const aceitaHorarioRepartido = formData.get("aceitaHorarioRepartido") === "on";
    const aceitaHorasExtras = formData.get("aceitaHorasExtras") === "on";

    // Validações básicas
    if (!nome || !cargo) {
      return {
        erro: "Nome e cargo são obrigatórios.",
      };
    }

    if (
      valorHora !== null &&
      (!Number.isFinite(valorHora) || valorHora < 0)
    ) {
      return {
        erro: "O valor/hora não pode ser negativo.",
      };
    }

    if (pausaAlmocoMinutos < 0) {
      return {
        erro: "A pausa de almoço não pode ser negativa.",
      };
    }

    // Se tem zonaId, valida se pertence ao restaurante
    if (zonaId) {
      const { data: zona, error: erroZona } = await supabase
        .from("zonas")
        .select("id")
        .eq("id", zonaId)
        .eq("restaurante_id", gerente.restauranteId)
        .single();

      if (erroZona || !zona) {
        return {
          erro: "Zona selecionada não existe ou não pertence ao seu restaurante.",
        };
      }
    }

    // Se é criação nova, valida limite de funcionários
    if (!id) {
      const { count } = await supabase
        .from("funcionarios")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("restaurante_id", gerente.restauranteId)
        .eq("ativo", true);

      const { data: restaurante } = await supabase
        .from("restaurantes")
        .select("max_funcionarios")
        .eq("id", gerente.restauranteId)
        .single();

      if (
        restaurante &&
        (count ?? 0) >= restaurante.max_funcionarios
      ) {
        return {
          erro: `Seu plano permite até ${restaurante.max_funcionarios} funcionários ativos.`,
        };
      }
    }

    // Se é edição, valida se funcionário pertence ao restaurante
    if (id) {
      const { data: funcionarioExistente } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("id", id)
        .eq("restaurante_id", gerente.restauranteId)
        .single();

      if (!funcionarioExistente) {
        return {
          erro: "Funcionário não encontrado ou não pertence ao seu restaurante.",
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
      valor_hora: valorHora,
      frequencia_pagamento: frequenciaPagamento,
      pausa_almoco_minutos: pausaAlmocoMinutos,
      pode_abertura: podeAbertura,
      pode_fechamento: podeFechamento,
      aceita_horario_repartido: aceitaHorarioRepartido,
      aceita_horas_extras: aceitaHorasExtras,
      eh_gerencia: ehGerencia,
      tipo_contrato: "full_time" as const,
      modalidade_pagamento: "mes" as const,
    };

    const { data: funcionario, error } = id
      ? await supabase
          .from("funcionarios")
          .update(payload)
          .eq("id", id)
          .eq("restaurante_id", gerente.restauranteId)
          .select("id")
          .single()
      : await supabase
          .from("funcionarios")
          .insert(payload)
          .select("id")
          .single();

    if (error || !funcionario) {
      const mensagemErro = getErrorMessage(error);

      return {
        erro: `Falha ao salvar funcionário: ${mensagemErro}`,
      };
    }

    // Limpa e recria disponibilidades
    await supabase
      .from("disponibilidades")
      .delete()
      .eq("funcionario_id", funcionario.id)
      .eq("restaurante_id", gerente.restauranteId);

    const linhas = lerDisponibilidade(formData);

    if (linhas.length > 0) {
      const { error: erroDisp } = await supabase
        .from("disponibilidades")
        .insert(
          linhas.map((l) => ({
            restaurante_id: gerente.restauranteId,
            funcionario_id: funcionario.id,
            dia_semana: l.diaSemana,
            disponivel: l.disponivel,
            periodo: l.periodo,
          }))
        );

      if (erroDisp) {
        const mensagemErro = getErrorMessage(erroDisp);

        return {
          erro: `Falha ao salvar disponibilidades: ${mensagemErro}`,
        };
      }
    }

    revalidatePath("/escalas");
    revalidatePath("/funcionarios");

    return {
      sucesso: true,
    };
  } catch (e) {
    const mensagem =
      e instanceof Error
        ? e.message
        : "Erro desconhecido ao salvar funcionário";

    return {
      erro: mensagem,
    };
  }
}

export interface DesativarFuncionarioState {
  erro?: string;
  sucesso?: boolean;
}

export async function desativarFuncionario(
  funcionarioId: string
): Promise<DesativarFuncionarioState> {
  try {
    const gerente = await requireGerente();
    const supabase = await createClient();

    // Valida se funcionário pertence ao restaurante
    const { data: funcionario, error: erroVerif } = await supabase
      .from("funcionarios")
      .select("id")
      .eq("id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId)
      .single();

    if (erroVerif || !funcionario) {
      return {
        erro: "Funcionário não encontrado ou não pertence ao seu restaurante.",
      };
    }

    // Desativa funcionário
    const { error: erroUpdate } = await supabase
      .from("funcionarios")
      .update({ ativo: false })
      .eq("id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId);

    if (erroUpdate) {
      const mensagem = getErrorMessage(erroUpdate);

      return {
        erro: `Falha ao desativar funcionário: ${mensagem}`,
      };
    }

    revalidatePath("/escalas");
    revalidatePath("/funcionarios");

    return {
      sucesso: true,
    };
  } catch (e) {
    const mensagem =
      e instanceof Error
        ? e.message
        : "Erro desconhecido ao desativar funcionário";

    return {
      erro: mensagem,
    };
  }
}

export async function getResumoPagamentoAction(
  funcionarioId: string
): Promise<ResumoPagamento | { erro: string }> {
  try {
    const gerente = await requireGerente();

    // Validação: funcionário pertence ao restaurante
    const supabase = await createClient();

    const { data: funcionario, error: erroVerif } = await supabase
      .from("funcionarios")
      .select("id")
      .eq("id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId)
      .single();

    if (erroVerif || !funcionario) {
      return {
        erro: "Funcionário não encontrado.",
      };
    }

    return await getResumoPagamento(
      funcionarioId,
      gerente.restauranteId
    );
  } catch (e) {
    const mensagem =
      e instanceof Error
        ? e.message
        : "Falha ao calcular o resumo de pagamento.";

    return {
      erro: mensagem,
    };
  }
}

export interface PontoState {
  erro?: string;
  emAberto?: boolean;
}

/**
 * Ponto batido pelo gerente na UI é sempre origem='manual'.
 * O 'automatico' só vem do cron.
 */
export async function baterPonto(
  funcionarioId: string
): Promise<PontoState> {
  try {
    const gerente = await requireGerente();
    const supabase = await createClient();

    // Valida se funcionário existe E pertence ao restaurante
    const { data: funcionario, error: erroFunc } = await supabase
      .from("funcionarios")
      .select("id, restaurante_id")
      .eq("id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId)
      .single();

    if (erroFunc || !funcionario) {
      return {
        erro: "Funcionário não encontrado ou não pertence ao seu restaurante.",
      };
    }

    // Verifica se restaurante está aberto hoje
    const { data: restaurante } = await supabase
      .from("restaurantes")
      .select("dias_funcionamento")
      .eq("id", gerente.restauranteId)
      .single();

    const diasFuncionamento: number[] =
      restaurante?.dias_funcionamento ?? [0, 1, 2, 3, 4, 5, 6];

    const diaSemanaHoje =
      (new Date().getUTCDay() + 6) % 7;

    // Procura ponto aberto
    const { data: aberto } = await supabase
      .from("registros_ponto")
      .select("id")
      .eq("funcionario_id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId)
      .is("saida", null)
      .maybeSingle();

    if (aberto) {
      // Registra saída
      const { error: erroSaida } = await supabase
        .from("registros_ponto")
        .update({
          saida: new Date().toISOString(),
        })
        .eq("id", aberto.id)
        .eq("restaurante_id", gerente.restauranteId);

      if (erroSaida) {
        const mensagem = getErrorMessage(erroSaida);

        return {
          erro: `Falha ao registrar saída: ${mensagem}`,
        };
      }

      revalidatePath("/escalas");
      revalidatePath("/pagamentos");

      return {
        emAberto: false,
      };
    }

    // Valida se restaurante estava aberto HOJE antes de registrar entrada
    if (!diasFuncionamento.includes(diaSemanaHoje)) {
      return {
        erro: "O restaurante está fechado hoje — não é possível bater ponto.",
      };
    }

    // Registra entrada
    const { error: erroEntrada } = await supabase
      .from("registros_ponto")
      .insert({
        restaurante_id: gerente.restauranteId,
        funcionario_id: funcionarioId,
        entrada: new Date().toISOString(),
        origem: "manual",
      });

    if (erroEntrada) {
      const mensagem = getErrorMessage(erroEntrada);

      return {
        erro: `Falha ao registrar entrada: ${mensagem}`,
      };
    }

    revalidatePath("/escalas");
    revalidatePath("/pagamentos");

    return {
      emAberto: true,
    };
  } catch (e) {
    const mensagem =
      e instanceof Error
        ? e.message
        : "Erro desconhecido ao bater ponto";

    return {
      erro: mensagem,
    };
  }
}

export interface MarcarPagoState {
  erro?: string;
  sucesso?: boolean;
}

export async function marcarComoPago(
  funcionarioId: string
): Promise<MarcarPagoState> {
  try {
    const gerente = await requireGerente();
    const supabase = await createClient();

    // Valida se funcionário pertence ao restaurante
    const { data: funcionario, error: erroVerif } = await supabase
      .from("funcionarios")
      .select("id")
      .eq("id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId)
      .single();

    if (erroVerif || !funcionario) {
      return {
        erro: "Funcionário não encontrado ou não pertence ao seu restaurante.",
      };
    }

    // Calcula resumo de pagamento
    const resumo = await getResumoPagamento(
      funcionarioId,
      gerente.restauranteId
    );

    if (resumo.horasFinalizadasNaoPagas === 0) {
      return {
        erro: "Não há horas finalizadas pendentes de pagamento.",
      };
    }

    // Marca pontos como pagos COM validação de restaurante
    const { error: erroUpdate } = await supabase
      .from("registros_ponto")
      .update({
        pago: true,
      })
      .eq("funcionario_id", funcionarioId)
      .eq("restaurante_id", gerente.restauranteId)
      .eq("pago", false)
      .not("saida", "is", null);

    if (erroUpdate) {
      const mensagem = getErrorMessage(erroUpdate);

      return {
        erro: `Falha ao registrar pagamento: ${mensagem}`,
      };
    }

    // Registra no histórico de pagamentos
    const { error: erroHistorico } = await supabase
      .from("pagamentos_historico")
      .insert({
        restaurante_id: gerente.restauranteId,
        funcionario_id: funcionarioId,
        periodo_inicio:
          resumo.desdeMaisAntigo ?? new Date().toISOString(),
        periodo_fim: new Date().toISOString(),
        horas_trabalhadas: resumo.horasFinalizadasNaoPagas,
        valor_pago: resumo.valorFinalizadoNaoPago,
        pago_por: gerente.id,
      });

    if (erroHistorico) {
      const mensagem = getErrorMessage(erroHistorico);

      return {
        erro: `Falha ao registrar histórico de pagamento: ${mensagem}`,
      };
    }

    revalidatePath("/escalas");
    revalidatePath("/pagamentos");
    revalidatePath("/funcionarios");

    return {
      sucesso: true,
    };
  } catch (e) {
    const mensagem =
      e instanceof Error
        ? e.message
        : "Erro desconhecido ao marcar como pago";

    return {
      erro: mensagem,
    };
  }
}
