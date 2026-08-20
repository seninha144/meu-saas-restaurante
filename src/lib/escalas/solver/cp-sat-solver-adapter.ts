import { avaliarSolucao } from "../avaliar-solucao.ts";
import type { TurnoCandidato } from "../candidatos-turno.ts";
import { criarSolucaoSemanal } from "../solucao-semanal.ts";
import type { SnapshotSemanal } from "../snapshot-semanal.ts";
import {
  horasExtrasPermitidas,
  limiteAutomaticoFuncionario,
} from "../limite-carga-semanal.ts";
import { validarSolucao } from "../validar-solucao.ts";
import type {
  OpcoesSolver,
  ResultadoSolver,
  SolverAdapter,
  StatusSolver,
} from "./solver-adapter.ts";
import { MAX_MINUTOS_DIARIOS_AUTOMATICOS } from "../contexto-temporal.ts";
import { cargaAlvoPlanejavel } from "../carga-planejavel.ts";

const MINUTOS_DIA = 24 * 60;

interface RespostaCpSat {
  status: "optimal" | "feasible" | "infeasible" | "unknown" | "model_invalid";
  candidateIds: string[];
  solveTimeMs: number;
  variables: number;
  constraints: number;
  seed: number;
  completedStages: string[];
  message?: string;
}

export interface ConfiguracaoCpSatAdapter {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

function paraMinutos(hora: string | null): number | null {
  if (!hora || !/^\d{2}:\d{2}/.test(hora)) return null;
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

function fronteiraAnterior(snapshot: SnapshotSemanal) {
  const finais = new Map<string, number>();
  const diasTrabalhados = new Map<string, Set<number>>();
  for (const turno of snapshot.turnosSemanaAnterior) {
    const inicio = paraMinutos(turno.horaInicio);
    let fim = paraMinutos(turno.horaFim);
    if (inicio === null || fim === null) continue;
    if (fim <= inicio) fim += MINUTOS_DIA;
    const inicioRelativo = (turno.diaSemana - 7) * MINUTOS_DIA + inicio;
    const fimRelativo = (turno.diaSemana - 7) * MINUTOS_DIA + fim;
    finais.set(turno.funcionarioId, Math.max(finais.get(turno.funcionarioId) ?? -Infinity, fimRelativo));
    const dias = diasTrabalhados.get(turno.funcionarioId) ?? new Set<number>();
    dias.add(turno.diaSemana - 7);
    diasTrabalhados.set(turno.funcionarioId, dias);
    void inicioRelativo;
  }
  return {
    ultimosFins: Object.fromEntries(finais),
    diasTrabalhados: Object.fromEntries(
      [...diasTrabalhados].map(([id, dias]) => [id, [...dias].sort((a, b) => a - b)])
    ),
  };
}

export function criarPayloadCpSat(
  snapshot: SnapshotSemanal,
  candidatos: TurnoCandidato[],
  limiteTempoMs: number
) {
  return {
    semana: snapshot.semana.inicio,
    temporal: snapshot.temporal,
    limiteDiarioAutomaticoMinutos: MAX_MINUTOS_DIARIOS_AUTOMATICOS,
    limiteTempoMs,
    diasAbertos: snapshot.diasAbertos,
    horarios: snapshot.horarios,
    restaurante: {
      usaZonas: snapshot.restaurante.usaZonas,
      permiteHorarioRepartido: snapshot.restaurante.permiteHorarioRepartido,
      permiteHorasExtras: snapshot.restaurante.permiteHorasExtras,
      limiteHorasExtrasSemanais: snapshot.restaurante.limiteHorasExtrasSemanais,
    },
    funcionarios: snapshot.funcionarios.map((item) => ({
      id: item.id,
      funcao: item.cargo,
      zonaId: item.zonaId,
      cargaAlvoMinutos: Math.round(cargaAlvoPlanejavel(snapshot, item) * 60),
      cargaContratadaMinutos: Math.round(item.cargaHorariaSemanalMax * 60),
      limiteAutomaticoMinutos: Math.round(
        limiteAutomaticoFuncionario(snapshot.restaurante, item) * 60
      ),
      horasExtrasPermitidasMinutos: Math.round(
        horasExtrasPermitidas(snapshot.restaurante, item) * 60
      ),
      aceitaHorasExtras: item.aceitaHorasExtras,
      aceitaHorarioRepartido: item.aceitaHorarioRepartido,
    })),
    candidatos: candidatos.map((item) => ({
      id: item.id,
      funcionarioId: item.funcionarioId,
      diaSemana: item.diaSemana,
      zonaId: item.zonaId,
      funcao: item.funcao,
      inicio: item.inicioMinutosAbsolutos,
      fim: item.fimMinutosAbsolutos,
      duracao: item.duracaoMinutos,
      duracaoEfetiva: Math.max(
        0,
        item.duracaoMinutos -
          (snapshot.funcionarios.find((funcionario) => funcionario.id === item.funcionarioId)
            ?.pausaAlmocoMinutos ?? 0)
      ),
      periodos: item.periodosOperacionais,
      cobreAbertura: item.cobreAbertura,
      cobreFechamento: item.cobreFechamento,
    })),
    necessidades: snapshot.necessidades,
    zonas: snapshot.zonas,
    movimentos: snapshot.movimentos,
    disponibilidades: snapshot.disponibilidades,
    historico: snapshot.historicoQuatroSemanas,
    semanaAnterior: snapshot.turnosSemanaAnterior,
    fronteiraAnterior: fronteiraAnterior(snapshot),
  };
}

function resultadoSemSolucao(
  status: StatusSolver,
  inicio: number,
  candidatos: number,
  motivo: string
): ResultadoSolver {
  return {
    status,
    tempoResolucaoMs: Math.round((performance.now() - inicio) * 100) / 100,
    quantidadeCandidatos: candidatos,
    quantidadeVariaveis: candidatos,
    diagnostico: { motivo, violacoes: [] },
    metadados: {
      adapter: "cp-sat-http",
      versao: "1",
      deterministico: true,
      iteracoes: 0,
      fallbackRecomendado: true,
    },
  };
}

function respostaValida(valor: unknown): valor is RespostaCpSat {
  if (!valor || typeof valor !== "object") return false;
  const item = valor as Record<string, unknown>;
  return (
    ["optimal", "feasible", "infeasible", "unknown", "model_invalid"].includes(String(item.status)) &&
    Array.isArray(item.candidateIds) &&
    item.candidateIds.every((id) => typeof id === "string") &&
    Number.isFinite(item.solveTimeMs) &&
    Number.isInteger(item.variables) &&
    Number.isInteger(item.constraints) &&
    Number.isInteger(item.seed) &&
    Array.isArray(item.completedStages)
  );
}

export class CpSatSolverAdapter implements SolverAdapter {
  private readonly url?: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(configuracao: ConfiguracaoCpSatAdapter = {}) {
    this.url = configuracao.url ?? process.env.CP_SAT_SERVICE_URL;
    this.token = configuracao.token ?? process.env.CP_SAT_SERVICE_TOKEN;
    this.fetchImpl = configuracao.fetchImpl ?? fetch;
  }

  async resolver(
    snapshot: SnapshotSemanal,
    candidatos: TurnoCandidato[],
    opcoes: OpcoesSolver = {}
  ): Promise<ResultadoSolver> {
    const inicio = performance.now();
    if (!this.url) {
      return resultadoSemSolucao("indisponivel", inicio, candidatos.length, "Serviço CP-SAT não configurado.");
    }
    if (opcoes.sinal?.aborted) {
      return resultadoSemSolucao("cancelado", inicio, candidatos.length, "Resolução cancelada pelo chamador.");
    }

    const limiteTempoMs = Math.max(1, opcoes.limiteTempoMs ?? 10_000);
    const controller = new AbortController();
    const cancelar = () => controller.abort();
    opcoes.sinal?.addEventListener("abort", cancelar, { once: true });
    const temporizador = setTimeout(() => controller.abort(), limiteTempoMs + 1_000);

    try {
      const respostaHttp = await this.fetchImpl(`${this.url.replace(/\/$/, "")}/solve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(criarPayloadCpSat(snapshot, candidatos, limiteTempoMs)),
        signal: controller.signal,
      });
      if (!respostaHttp.ok) {
        return resultadoSemSolucao(
          respostaHttp.status >= 500 ? "indisponivel" : "erro",
          inicio,
          candidatos.length,
          `Serviço CP-SAT respondeu HTTP ${respostaHttp.status}.`
        );
      }
      const corpo: unknown = await respostaHttp.json();
      if (!respostaValida(corpo)) {
        return resultadoSemSolucao("erro", inicio, candidatos.length, "Resposta inválida do serviço CP-SAT.");
      }
      if (corpo.status === "infeasible") {
        return resultadoSemSolucao("inviavel_comprovado", inicio, candidatos.length, corpo.message ?? "CP-SAT comprovou inviabilidade.");
      }
      if (corpo.status === "unknown") {
        return resultadoSemSolucao("tempo_esgotado", inicio, candidatos.length, corpo.message ?? "CP-SAT não encontrou solução antes do limite.");
      }
      if (corpo.status === "model_invalid") {
        return resultadoSemSolucao("erro", inicio, candidatos.length, corpo.message ?? "Modelo CP-SAT inválido.");
      }

      const idsDisponiveis = new Map(candidatos.map((item) => [item.id, item]));
      if (new Set(corpo.candidateIds).size !== corpo.candidateIds.length) {
        return resultadoSemSolucao("erro", inicio, candidatos.length, "Resposta CP-SAT contém IDs duplicados.");
      }
      const escolhidos = corpo.candidateIds.map((id) => idsDisponiveis.get(id));
      if (escolhidos.some((item) => !item)) {
        return resultadoSemSolucao("erro", inicio, candidatos.length, "Resposta CP-SAT contém candidato desconhecido.");
      }
      const solucao = criarSolucaoSemanal(snapshot, escolhidos.map((item) => ({
        id: item!.id,
        funcionarioId: item!.funcionarioId,
        diaSemana: item!.diaSemana,
        zonaId: item!.zonaId,
        horaInicio: item!.horaInicio,
        horaFim: item!.horaFim,
      })));
      const validacao = validarSolucao(snapshot, solucao);
      const avaliacao = avaliarSolucao(snapshot, solucao, validacao);
      return {
        status: validacao.valida ? "solucao_valida" : "solucao_invalida",
        solucao,
        validacao,
        avaliacao,
        tempoResolucaoMs: corpo.solveTimeMs,
        quantidadeCandidatos: candidatos.length,
        quantidadeVariaveis: corpo.variables,
        diagnostico: {
          motivo: validacao.valida
            ? `CP-SAT retornou solução ${corpo.status}.`
            : "A resposta do CP-SAT foi rejeitada pelo validador TypeScript.",
          violacoes: validacao.erros.slice(0, 20).map(({ codigo, mensagem }) => ({ codigo, mensagem })),
        },
        metadados: {
          adapter: "ortools-cp-sat-http",
          versao: "1",
          deterministico: true,
          iteracoes: corpo.completedStages.length,
          fallbackRecomendado: !validacao.valida,
          quantidadeConstraints: corpo.constraints,
          otimal: corpo.status === "optimal",
          seed: corpo.seed,
        },
      };
    } catch (error) {
      const cancelado = opcoes.sinal?.aborted;
      const timeout = controller.signal.aborted && !cancelado;
      return resultadoSemSolucao(
        cancelado ? "cancelado" : timeout ? "tempo_esgotado" : "indisponivel",
        inicio,
        candidatos.length,
        cancelado
          ? "Resolução cancelada pelo chamador."
          : timeout
            ? "Timeout HTTP ao chamar o serviço CP-SAT."
            : `Serviço CP-SAT indisponível: ${error instanceof Error ? error.message : "erro de comunicação"}.`
      );
    } finally {
      clearTimeout(temporizador);
      opcoes.sinal?.removeEventListener("abort", cancelar);
    }
  }
}
