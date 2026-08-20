import type { AvaliacaoSolucao } from "../avaliar-solucao.ts";
import type { TurnoCandidato } from "../candidatos-turno.ts";
import type { SolucaoSemanal } from "../solucao-semanal.ts";
import type { SnapshotSemanal } from "../snapshot-semanal.ts";
import type { ResultadoValidacaoSolucao } from "../validar-solucao.ts";

export type StatusSolver =
  | "solucao_valida"
  | "nenhuma_solucao_encontrada"
  | "inviavel_comprovado"
  | "solucao_invalida"
  | "tempo_esgotado"
  | "cancelado"
  | "indisponivel"
  | "erro";

export interface OpcoesSolver {
  limiteTempoMs?: number;
  sinal?: AbortSignal;
}

export interface DiagnosticoSolver {
  motivo: string;
  violacoes: Array<{
    codigo: string;
    mensagem: string;
  }>;
}

export interface MetadadosSolver {
  adapter: string;
  versao: string;
  deterministico: boolean;
  iteracoes: number;
  fallbackRecomendado: boolean;
  quantidadeConstraints?: number;
  otimal?: boolean;
  seed?: number;
}

export interface ResultadoSolver {
  status: StatusSolver;
  solucao?: SolucaoSemanal;
  validacao?: ResultadoValidacaoSolucao;
  avaliacao?: AvaliacaoSolucao;
  tempoResolucaoMs: number;
  quantidadeCandidatos: number;
  quantidadeVariaveis: number;
  diagnostico: DiagnosticoSolver;
  metadados: MetadadosSolver;
}

export interface SolverAdapter {
  resolver(
    snapshot: SnapshotSemanal,
    candidatos: TurnoCandidato[],
    opcoes?: OpcoesSolver
  ): Promise<ResultadoSolver>;
}

export type FallbackSolver = () => Promise<ResultadoSolver>;

/** Orquestração explícita para uso futuro; não está ligada ao fluxo de produção. */
export async function resolverComFallback(
  adapter: SolverAdapter,
  snapshot: SnapshotSemanal,
  candidatos: TurnoCandidato[],
  fallback: FallbackSolver,
  opcoes?: OpcoesSolver
): Promise<ResultadoSolver> {
  const resultado = await adapter.resolver(snapshot, candidatos, opcoes);
  return resultado.status === "solucao_valida" ? resultado : fallback();
}
