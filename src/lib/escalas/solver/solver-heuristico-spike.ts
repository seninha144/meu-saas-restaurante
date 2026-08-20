import { avaliarSolucao } from "../avaliar-solucao.ts";
import type { TurnoCandidato } from "../candidatos-turno.ts";
import { criarSolucaoSemanal, type EntradaTurnoSolucao } from "../solucao-semanal.ts";
import type { SnapshotSemanal } from "../snapshot-semanal.ts";
import { validarSolucao, type ResultadoValidacaoSolucao } from "../validar-solucao.ts";
import type { OpcoesSolver, ResultadoSolver, SolverAdapter, StatusSolver } from "./solver-adapter.ts";

const LIMITE_PADRAO_MS = 10_000;
const ERROS_ESTRUTURAIS = new Set([
  "DIA_FECHADO",
  "HORARIO_INVALIDO",
  "FORA_DA_OPERACAO",
  "FUNCIONARIO_INEXISTENTE",
  "FUNCIONARIO_INDISPONIVEL",
  "ZONA_INCOMPATIVEL",
  "SOBREPOSICAO",
  "DESCANSO_INSUFICIENTE",
  "SETE_DIAS_CONSECUTIVOS",
]);

function paraTurno(candidato: TurnoCandidato): EntradaTurnoSolucao {
  return {
    id: candidato.id,
    funcionarioId: candidato.funcionarioId,
    diaSemana: candidato.diaSemana,
    zonaId: candidato.zonaId,
    horaInicio: candidato.horaInicio,
    horaFim: candidato.horaFim,
  };
}

function custoParcial(validacao: ResultadoValidacaoSolucao): number[] {
  const errosCobertura = validacao.erros.filter((erro) => !ERROS_ESTRUTURAIS.has(erro.codigo));
  return [
    errosCobertura.length,
    validacao.metricas.periodosAbaixoMinimo,
    validacao.metricas.funcoesAbaixoMinimo,
    Math.max(
      0,
      validacao.metricas.coberturaMinimaNecessaria -
        validacao.metricas.coberturaMinimaEncontrada
    ),
  ];
}

function compararCusto(a: number[], b: number[]) {
  for (let indice = 0; indice < Math.max(a.length, b.length); indice++) {
    const diferenca = (a[indice] ?? 0) - (b[indice] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return 0;
}

function finalizar(
  inicio: number,
  candidatos: TurnoCandidato[],
  selecionados: TurnoCandidato[],
  snapshot: SnapshotSemanal,
  status: StatusSolver,
  iteracoes: number,
  motivo: string
): ResultadoSolver {
  const solucao = criarSolucaoSemanal(snapshot, selecionados.map(paraTurno));
  const validacao = validarSolucao(snapshot, solucao);
  return {
    status,
    solucao: selecionados.length > 0 || validacao.valida ? solucao : undefined,
    validacao,
    avaliacao: validacao.valida ? avaliarSolucao(snapshot, solucao, validacao) : undefined,
    tempoResolucaoMs: Math.round((performance.now() - inicio) * 100) / 100,
    quantidadeCandidatos: candidatos.length,
    quantidadeVariaveis: candidatos.length,
    diagnostico: {
      motivo,
      violacoes: validacao.erros.slice(0, 20).map(({ codigo, mensagem }) => ({ codigo, mensagem })),
    },
    metadados: {
      adapter: "heuristico-guloso-spike",
      versao: "1",
      deterministico: true,
      iteracoes,
      fallbackRecomendado: status !== "solucao_valida",
    },
  };
}

/**
 * Spike de viabilidade sem dependências externas. Ele prova o contrato e a
 * integração com validação/avaliação, mas não substitui um solver combinatório.
 */
export class SolverHeuristicoSpike implements SolverAdapter {
  async resolver(
    snapshot: SnapshotSemanal,
    candidatosRecebidos: TurnoCandidato[],
    opcoes: OpcoesSolver = {}
  ): Promise<ResultadoSolver> {
    const inicio = performance.now();
    const limite = Math.max(1, opcoes.limiteTempoMs ?? LIMITE_PADRAO_MS);
    const candidatos = [...candidatosRecebidos].sort((a, b) => a.id.localeCompare(b.id));
    const selecionados: TurnoCandidato[] = [];
    const utilizados = new Set<string>();
    let iteracoes = 0;

    while (true) {
      const atual = validarSolucao(
        snapshot,
        criarSolucaoSemanal(snapshot, selecionados.map(paraTurno))
      );
      if (atual.valida) {
        return finalizar(inicio, candidatos, selecionados, snapshot, "solucao_valida", iteracoes, "Solução válida encontrada pelo spike.");
      }
      if (opcoes.sinal?.aborted) {
        return finalizar(inicio, candidatos, selecionados, snapshot, "cancelado", iteracoes, "Resolução cancelada pelo chamador.");
      }
      if (performance.now() - inicio >= limite) {
        return finalizar(inicio, candidatos, selecionados, snapshot, "tempo_esgotado", iteracoes, "Limite de resolução atingido; o fallback poderá ser acionado futuramente.");
      }

      const custoAtual = custoParcial(atual);
      let melhor: { candidato: TurnoCandidato; custo: number[] } | undefined;

      for (const candidato of candidatos) {
        if (utilizados.has(candidato.id)) continue;
        if (selecionados.some((item) =>
          item.funcionarioId === candidato.funcionarioId && item.diaSemana === candidato.diaSemana
        )) continue;
        const tentativa = validarSolucao(
          snapshot,
          criarSolucaoSemanal(snapshot, [...selecionados, candidato].map(paraTurno))
        );
        iteracoes++;
        if (tentativa.erros.some((erro) => ERROS_ESTRUTURAIS.has(erro.codigo))) continue;
        const custo = custoParcial(tentativa);
        if (compararCusto(custo, custoAtual) >= 0) continue;
        if (!melhor || compararCusto(custo, melhor.custo) < 0) melhor = { candidato, custo };
      }

      if (!melhor) {
        return finalizar(inicio, candidatos, selecionados, snapshot, "nenhuma_solucao_encontrada", iteracoes, "A heurística não encontrou avanço viável. Isto não constitui prova matemática de inviabilidade.");
      }
      selecionados.push(melhor.candidato);
      utilizados.add(melhor.candidato.id);
    }
  }
}
