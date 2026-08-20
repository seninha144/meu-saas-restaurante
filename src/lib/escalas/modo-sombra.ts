import { avaliarSolucao, type AvaliacaoSolucao } from "./avaliar-solucao.ts";
import { gerarCandidatosTurno } from "./candidatos-turno.ts";
import {
  criarSolucaoSemanal,
  type EntradaTurnoSolucao,
  type SolucaoSemanal,
} from "./solucao-semanal.ts";
import { SolverHeuristicoSpike } from "./solver/solver-heuristico-spike.ts";
import { CpSatSolverAdapter } from "./solver/cp-sat-solver-adapter.ts";
import type { SolverAdapter, StatusSolver } from "./solver/solver-adapter.ts";
import type { SnapshotSemanal } from "./snapshot-semanal.ts";
import {
  validarSolucao,
  type ResultadoValidacaoSolucao,
} from "./validar-solucao.ts";

export interface TurnoLegadoSombra {
  id?: string;
  funcionario_id: string;
  dia_semana: number;
  zona_id: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
}

export interface ResumoMetricasSombra {
  valida: boolean;
  coberturaMinimaPercentual: number;
  distanciaParaIdeal: number;
  excessoAcimaMaximo: number;
  horasExtrasUtilizadas: number;
  desvioProporcionalCarga: number;
  justicaHistorica: number;
  preferencias: number;
  aberturas: number;
  fechamentos: number;
  periodosAbaixoMinimo: number;
  funcoesAbaixoMinimo: number;
}

export interface ResultadoComparado {
  solucao: SolucaoSemanal;
  validacao: ResultadoValidacaoSolucao;
  avaliacao: AvaliacaoSolucao;
  metricas: ResumoMetricasSombra;
  tempoMs: number;
  solver?: {
    candidatos: number;
    variaveis: number;
    constraints: number | null;
    otimal: boolean | null;
  };
}

export interface DiferencaModoSombra {
  metrica: keyof ResumoMetricasSombra;
  legado: boolean | number;
  sombra: boolean | number;
  diferenca?: number;
}

export type VencedorModoSombra = "legado" | "sombra" | "empate" | "sem_comparacao";
export type ResultadoExecucaoSombra = (ResultadoComparado & { status: StatusSolver }) | {
  status: StatusSolver;
  tempoMs: number;
  diagnostico: string;
};

export interface ComparacaoModoSombra {
  semana: string;
  legado: ResultadoComparado;
  sombra: ResultadoExecucaoSombra;
  cpSat: ResultadoExecucaoSombra;
  comparacao: {
    vencedor: VencedorModoSombra;
    nivelDecisivo: string | null;
    diferencas: DiferencaModoSombra[];
  };
  comparacaoTres: {
    vencedor: "legado" | "heuristica" | "cp_sat" | "empate";
    nivelDecisivo: string | null;
  };
}

export interface EntradaModoSombra {
  snapshot: SnapshotSemanal;
  turnosLegado: TurnoLegadoSombra[];
  tempoLegadoMs: number;
  solver?: SolverAdapter;
  cpSatSolver?: SolverAdapter;
  executarCpSat?: boolean;
  limiteTempoMs?: number;
}

const NIVEIS_VALIDOS = [
  "validade",
  "coberturaIdeal",
  "excessoMaximo",
  "horasExtras",
  "carga",
  "justica",
  "preferencias",
] as const;

function somar(mapa: Record<string, number>): number {
  return Object.values(mapa).reduce((total, valor) => total + valor, 0);
}

function resumirMetricas(
  validacao: ResultadoValidacaoSolucao,
  avaliacao: AvaliacaoSolucao
): ResumoMetricasSombra {
  return {
    valida: validacao.valida,
    coberturaMinimaPercentual: validacao.metricas.coberturaMinimaPercentual,
    distanciaParaIdeal: validacao.metricas.distanciaParaIdeal,
    excessoAcimaMaximo: validacao.metricas.excessoAcimaMaximo,
    horasExtrasUtilizadas: avaliacao.niveis.horasExtras.horasExtrasUtilizadas,
    desvioProporcionalCarga: avaliacao.niveis.carga.desvioProporcionalMedio,
    justicaHistorica: avaliacao.niveis.justica.custo,
    preferencias: avaliacao.niveis.preferencias.custo,
    aberturas: somar(validacao.metricas.aberturasPorFuncionario),
    fechamentos: somar(validacao.metricas.fechamentosPorFuncionario),
    periodosAbaixoMinimo: validacao.metricas.periodosAbaixoMinimo,
    funcoesAbaixoMinimo: validacao.metricas.funcoesAbaixoMinimo,
  };
}

export function converterLegadoParaSolucaoSemanal(
  snapshot: SnapshotSemanal,
  turnos: TurnoLegadoSombra[]
): SolucaoSemanal {
  const entradas: EntradaTurnoSolucao[] = turnos.flatMap((turno) => {
    if (!turno.hora_inicio || !turno.hora_fim) return [];
    return [{
      id: turno.id,
      funcionarioId: turno.funcionario_id,
      diaSemana: turno.dia_semana,
      zonaId: turno.zona_id,
      horaInicio: turno.hora_inicio.slice(0, 5),
      horaFim: turno.hora_fim.slice(0, 5),
    }];
  });
  return criarSolucaoSemanal(snapshot, entradas);
}

function avaliar(
  snapshot: SnapshotSemanal,
  solucao: SolucaoSemanal,
  tempoMs: number
): ResultadoComparado {
  const validacao = validarSolucao(snapshot, solucao);
  const avaliacao = avaliarSolucao(snapshot, solucao, validacao);
  return { solucao, validacao, avaliacao, metricas: resumirMetricas(validacao, avaliacao), tempoMs };
}

function compararQualidade(a: AvaliacaoSolucao, b: AvaliacaoSolucao) {
  const limite = Math.min(7, a.chaveComparacao.length, b.chaveComparacao.length);
  for (let indice = 0; indice < limite; indice++) {
    if (a.chaveComparacao[indice] === b.chaveComparacao[indice]) continue;
    return {
      resultado: a.chaveComparacao[indice] < b.chaveComparacao[indice] ? -1 : 1,
      nivel: NIVEIS_VALIDOS[indice] ?? "hardConstraints",
    };
  }
  return { resultado: 0, nivel: null };
}

function diferencas(
  legado: ResumoMetricasSombra,
  sombra: ResumoMetricasSombra
): DiferencaModoSombra[] {
  return (Object.keys(legado) as Array<keyof ResumoMetricasSombra>).map((metrica) => {
    const valorLegado = legado[metrica];
    const valorSombra = sombra[metrica];
    return {
      metrica,
      legado: valorLegado,
      sombra: valorSombra,
      ...(typeof valorLegado === "number" && typeof valorSombra === "number"
        ? { diferenca: Math.round((valorSombra - valorLegado) * 1_000_000) / 1_000_000 }
        : {}),
    };
  });
}

export async function executarModoSombra({
  snapshot,
  turnosLegado,
  tempoLegadoMs,
  solver = new SolverHeuristicoSpike(),
  cpSatSolver = new CpSatSolverAdapter(),
  executarCpSat = process.env.ENABLE_CP_SAT_SHADOW === "true",
  limiteTempoMs = 10_000,
}: EntradaModoSombra): Promise<ComparacaoModoSombra> {
  const legado = avaliar(
    snapshot,
    converterLegadoParaSolucaoSemanal(snapshot, turnosLegado),
    tempoLegadoMs
  );
  const inicioSombra = performance.now();
  const candidatos = gerarCandidatosTurno(snapshot);
  const resultadoSolver = await solver.resolver(snapshot, candidatos, { limiteTempoMs });
  const tempoSombra = Math.round((performance.now() - inicioSombra) * 100) / 100;

  const sombra: ResultadoExecucaoSombra = resultadoSolver.solucao && resultadoSolver.status === "solucao_valida"
    ? {
        ...avaliar(snapshot, resultadoSolver.solucao, tempoSombra),
        status: "solucao_valida",
        solver: {
          candidatos: resultadoSolver.quantidadeCandidatos,
          variaveis: resultadoSolver.quantidadeVariaveis,
          constraints: resultadoSolver.metadados.quantidadeConstraints ?? null,
          otimal: resultadoSolver.metadados.otimal ?? null,
        },
      }
    : { status: resultadoSolver.status, tempoMs: tempoSombra, diagnostico: resultadoSolver.diagnostico.motivo };
  const limiteCpSat = snapshot.funcionarios.length <= 5
    ? 2_000
    : snapshot.funcionarios.length <= 15
      ? 5_000
      : 10_000;
  let cpSat: ResultadoExecucaoSombra = {
    status: "indisponivel",
    tempoMs: 0,
    diagnostico: executarCpSat ? "Serviço CP-SAT indisponível." : "CP-SAT sombra desativado.",
  };
  if (executarCpSat) {
    const inicioCpSat = performance.now();
    const resultadoCpSat = await cpSatSolver.resolver(snapshot, candidatos, { limiteTempoMs: limiteCpSat });
    const tempoCpSat = Math.round((performance.now() - inicioCpSat) * 100) / 100;
    cpSat = resultadoCpSat.solucao && resultadoCpSat.status === "solucao_valida"
      ? {
          ...avaliar(snapshot, resultadoCpSat.solucao, tempoCpSat),
          status: "solucao_valida",
          solver: {
            candidatos: resultadoCpSat.quantidadeCandidatos,
            variaveis: resultadoCpSat.quantidadeVariaveis,
            constraints: resultadoCpSat.metadados.quantidadeConstraints ?? null,
            otimal: resultadoCpSat.metadados.otimal ?? null,
          },
        }
      : { status: resultadoCpSat.status, tempoMs: tempoCpSat, diagnostico: resultadoCpSat.diagnostico.motivo };
  }

  const decisao = "avaliacao" in sombra
    ? compararQualidade(sombra.avaliacao, legado.avaliacao)
    : { resultado: 0, nivel: null };
  const disponiveis = [
    { nome: "legado" as const, avaliacao: legado.avaliacao },
    ...(sombra.status === "solucao_valida" && "avaliacao" in sombra
      ? [{ nome: "heuristica" as const, avaliacao: sombra.avaliacao }]
      : []),
    ...(cpSat.status === "solucao_valida" && "avaliacao" in cpSat
      ? [{ nome: "cp_sat" as const, avaliacao: cpSat.avaliacao }]
      : []),
  ];
  const ordenados = [...disponiveis].sort((a, b) =>
    compararQualidade(a.avaliacao, b.avaliacao).resultado || a.nome.localeCompare(b.nome)
  );
  const melhores = ordenados.filter((item) =>
    compararQualidade(item.avaliacao, ordenados[0].avaliacao).resultado === 0
  );
  const nivelTres = ordenados.length > 1
    ? compararQualidade(ordenados[0].avaliacao, ordenados[1].avaliacao).nivel
    : null;

  return {
    semana: snapshot.semana.inicio,
    legado,
    sombra,
    cpSat,
    comparacao: {
      vencedor: "avaliacao" in sombra
        ? decisao.resultado < 0 ? "sombra" : decisao.resultado > 0 ? "legado" : "empate"
        : "sem_comparacao",
      nivelDecisivo: decisao.nivel,
      diferencas: "metricas" in sombra ? diferencas(legado.metricas, sombra.metricas) : [],
    },
    comparacaoTres: {
      vencedor: melhores.length === 1 ? melhores[0].nome : "empate",
      nivelDecisivo: nivelTres,
    },
  };
}

export function modoSombraHabilitado(): boolean {
  return process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_SHADOW_OPTIMIZER_IN_PRODUCTION === "true";
}

export function logarResumoModoSombra(resultado: ComparacaoModoSombra): void {
  if (!modoSombraHabilitado()) return;
  const sombraValida = "validacao" in resultado.sombra
    ? resultado.sombra.validacao.valida
    : false;
  const sombraIdeal = "metricas" in resultado.sombra
    ? resultado.sombra.metricas.distanciaParaIdeal
    : "n/d";
  const cpSatValido = "validacao" in resultado.cpSat && resultado.cpSat.validacao.valida;
  console.info([
    "[Shadow Optimizer]",
    `Semana: ${resultado.semana}`,
    `Legado: ${resultado.legado.validacao.valida ? "válido" : "inválido"}`,
    `Sombra: ${sombraValida ? "válido" : resultado.sombra.status}`,
    `CP-SAT: ${cpSatValido ? "válido" : resultado.cpSat.status}`,
    `Vencedor: ${resultado.comparacao.vencedor}`,
    `Nível decisivo: ${resultado.comparacao.nivelDecisivo ?? "nenhum"}`,
    `Ideal legado/sombra: ${resultado.legado.metricas.distanciaParaIdeal}/${sombraIdeal}`,
    `Tempo sombra: ${resultado.sombra.tempoMs}ms`,
    `Tempo CP-SAT: ${resultado.cpSat.tempoMs}ms`,
  ].join(" | "));
}
