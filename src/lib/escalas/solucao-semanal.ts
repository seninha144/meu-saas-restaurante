import { intervaloEmMinutos } from "../horas.ts";
import type { SemanaSnapshot, SnapshotSemanal } from "./snapshot-semanal.ts";

export interface TurnoSolucao {
  id: string;
  funcionarioId: string;
  diaSemana: number;
  zonaId: string | null;
  horaInicio: string;
  horaFim: string;
}

export interface ResumoSolucaoSemanal {
  totalTurnos: number;
  funcionariosEscalados: number;
  duracaoTotalMinutos: number;
}

export interface DiagnosticoSolucao {
  status: "nao_avaliada" | "valida" | "invalida";
  mensagens: string[];
}

export interface SolucaoSemanal {
  id: string;
  semana: SemanaSnapshot;
  turnos: TurnoSolucao[];
  resumo: ResumoSolucaoSemanal;
  diagnostico: DiagnosticoSolucao;
}

export type EntradaTurnoSolucao = Omit<TurnoSolucao, "id"> & { id?: string };

export function hashDeterministico(conteudo: string): string {
  let hash = 2166136261;
  for (let indice = 0; indice < conteudo.length; indice++) {
    hash ^= conteudo.charCodeAt(indice);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function chaveTurno(turno: EntradaTurnoSolucao) {
  return [
    turno.funcionarioId,
    turno.diaSemana,
    turno.zonaId ?? "sem-zona",
    turno.horaInicio,
    turno.horaFim,
  ].join(":");
}

export function criarSolucaoSemanal(
  snapshot: SnapshotSemanal,
  entradaTurnos: EntradaTurnoSolucao[]
): SolucaoSemanal {
  const ordenados = [...entradaTurnos].sort((a, b) => chaveTurno(a).localeCompare(chaveTurno(b)));
  const turnos = ordenados.map((turno, indice) => ({
    ...turno,
    id: turno.id ?? `turno-${hashDeterministico(`${snapshot.semana.inicio}:${chaveTurno(turno)}:${indice}`)}`,
  }));
  const duracaoTotalMinutos = turnos.reduce((total, turno) => {
    const intervalo = intervaloEmMinutos(turno.horaInicio, turno.horaFim);
    return total + Math.max(0, intervalo.fim - intervalo.inicio);
  }, 0);
  const id = `solucao-${hashDeterministico(
    `${snapshot.semana.inicio}|${turnos.map((turno) => turno.id).join("|")}`
  )}`;

  return {
    id,
    semana: { ...snapshot.semana },
    turnos,
    resumo: {
      totalTurnos: turnos.length,
      funcionariosEscalados: new Set(turnos.map((turno) => turno.funcionarioId)).size,
      duracaoTotalMinutos,
    },
    diagnostico: { status: "nao_avaliada", mensagens: [] },
  };
}
