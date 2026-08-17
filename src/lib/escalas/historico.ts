import { horasEfetivasDoTurno } from "../horas.ts";
import type { Periodo } from "@/types/dominio";

export interface TurnoHistorico {
  funcionarioId: string;
  semanaInicio: string;
  diaSemana: number;
  periodo: Periodo;
  horaInicio: string | null;
  horaFim: string | null;
}

export interface MetricasHistoricasFuncionario {
  fechamentos: number;
  aberturas: number;
  sabadosTrabalhados: number;
  domingosTrabalhados: number;
  finsDeSemanaCompletos: number;
  turnosPorPeriodo: Record<Periodo, number>;
  horasPlanejadas: number;
  padraoSemanaAnterior: string[];
}

export const PESOS_JUSTICA = {
  aberturaFechamento: 6,
  sabadoDomingo: 6,
  fimDeSemanaCompleto: 8,
  periodo: 3,
  horas: 12,
  repeticaoSemanaAnterior: -10,
} as const;

export interface ReferenciasJusticaEquipe {
  aberturas: number;
  fechamentos: number;
  sabados: number;
  domingos: number;
  finsDeSemanaCompletos: number;
  turnosPorPeriodo: Record<Periodo, number>;
  proporcaoHoras: number;
}

function fatorCarga(cargaSemanal: number): number {
  return Math.max(cargaSemanal, 1) / 40;
}

function limitar(valor: number, limite: number): number {
  return Math.max(-limite, Math.min(limite, valor));
}

export function calcularReferenciasJustica(
  metricas: Map<string, MetricasHistoricasFuncionario>,
  cargasSemanais: Map<string, number>
): ReferenciasJusticaEquipe {
  const referencia: ReferenciasJusticaEquipe = {
    aberturas: 0,
    fechamentos: 0,
    sabados: 0,
    domingos: 0,
    finsDeSemanaCompletos: 0,
    turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 0 },
    proporcaoHoras: 0,
  };
  if (metricas.size === 0) return referencia;

  for (const [funcionarioId, item] of metricas) {
    const carga = Math.max(cargasSemanais.get(funcionarioId) ?? 0, 1);
    const fator = fatorCarga(carga);
    referencia.aberturas += item.aberturas / fator;
    referencia.fechamentos += item.fechamentos / fator;
    referencia.sabados += item.sabadosTrabalhados / fator;
    referencia.domingos += item.domingosTrabalhados / fator;
    referencia.finsDeSemanaCompletos += item.finsDeSemanaCompletos / fator;
    referencia.proporcaoHoras += item.horasPlanejadas / (carga * 4);
    for (const periodo of Object.keys(item.turnosPorPeriodo) as Periodo[]) {
      referencia.turnosPorPeriodo[periodo] += item.turnosPorPeriodo[periodo] / fator;
    }
  }

  for (const campo of ["aberturas", "fechamentos", "sabados", "domingos", "finsDeSemanaCompletos", "proporcaoHoras"] as const) {
    referencia[campo] /= metricas.size;
  }
  for (const periodo of Object.keys(referencia.turnosPorPeriodo) as Periodo[]) {
    referencia.turnosPorPeriodo[periodo] /= metricas.size;
  }
  return referencia;
}

function vantagem(media: number, valor: number, peso: number, limite: number): number {
  return limitar((media - valor) * peso, limite);
}

export function pontuarJusticaHistorica(
  metricas: MetricasHistoricasFuncionario,
  cargaSemanal: number,
  referencia: ReferenciasJusticaEquipe,
  dia: number,
  periodo: Periodo
): number {
  const carga = Math.max(cargaSemanal, 1);
  const fator = fatorCarga(carga);
  let score = 0;

  if (periodo === "Manhã") {
    score += vantagem(referencia.aberturas, metricas.aberturas / fator, PESOS_JUSTICA.aberturaFechamento, 18);
  }
  if (periodo === "Fechamento") {
    score += vantagem(referencia.fechamentos, metricas.fechamentos / fator, PESOS_JUSTICA.aberturaFechamento, 18);
  }
  if (dia === 5) {
    score += vantagem(referencia.sabados, metricas.sabadosTrabalhados / fator, PESOS_JUSTICA.sabadoDomingo, 18);
  }
  if (dia === 6) {
    score += vantagem(referencia.domingos, metricas.domingosTrabalhados / fator, PESOS_JUSTICA.sabadoDomingo, 18);
  }
  if (dia === 5 || dia === 6) {
    score += vantagem(
      referencia.finsDeSemanaCompletos,
      metricas.finsDeSemanaCompletos / fator,
      PESOS_JUSTICA.fimDeSemanaCompleto,
      16
    );
  }
  score += vantagem(
    referencia.turnosPorPeriodo[periodo],
    metricas.turnosPorPeriodo[periodo] / fator,
    PESOS_JUSTICA.periodo,
    12
  );
  score += vantagem(
    referencia.proporcaoHoras,
    metricas.horasPlanejadas / (carga * 4),
    PESOS_JUSTICA.horas,
    12
  );
  if (metricas.padraoSemanaAnterior.includes(`${dia}:${periodo}`)) {
    score += PESOS_JUSTICA.repeticaoSemanaAnterior;
  }

  return score;
}

export function pontuarJusticaDoDia(
  metricas: MetricasHistoricasFuncionario,
  cargaSemanal: number,
  referencia: ReferenciasJusticaEquipe,
  dia: number
): number {
  const fator = fatorCarga(Math.max(cargaSemanal, 1));
  let score = 0;
  if (dia === 5) {
    score += vantagem(referencia.sabados, metricas.sabadosTrabalhados / fator, PESOS_JUSTICA.sabadoDomingo, 18);
  }
  if (dia === 6) {
    score += vantagem(referencia.domingos, metricas.domingosTrabalhados / fator, PESOS_JUSTICA.sabadoDomingo, 18);
  }
  if (dia === 5 || dia === 6) {
    score += vantagem(
      referencia.finsDeSemanaCompletos,
      metricas.finsDeSemanaCompletos / fator,
      PESOS_JUSTICA.fimDeSemanaCompleto,
      16
    );
  }
  return score;
}

export function desempateSemanal(chave: string): number {
  let hash = 2166136261;
  for (let indice = 0; indice < chave.length; indice++) {
    hash ^= chave.charCodeAt(indice);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function metricasVazias(): MetricasHistoricasFuncionario {
  return {
    fechamentos: 0,
    aberturas: 0,
    sabadosTrabalhados: 0,
    domingosTrabalhados: 0,
    finsDeSemanaCompletos: 0,
    turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 0 },
    horasPlanejadas: 0,
    padraoSemanaAnterior: [],
  };
}

function semanaAnterior(semanaReferencia: string): string {
  const data = new Date(`${semanaReferencia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 7);
  return data.toISOString().slice(0, 10);
}

export function agregarHistoricoTurnos(
  turnos: TurnoHistorico[],
  semanaReferencia: string,
  funcionariosIds: Iterable<string> = []
): Map<string, MetricasHistoricasFuncionario> {
  const resultado = new Map<string, MetricasHistoricasFuncionario>();
  const finsDeSemana = new Map<string, Map<string, Set<number>>>();
  const padroes = new Map<string, Set<string>>();
  const anterior = semanaAnterior(semanaReferencia);

  for (const funcionarioId of funcionariosIds) {
    resultado.set(funcionarioId, metricasVazias());
  }

  for (const turno of turnos) {
    const metricas = resultado.get(turno.funcionarioId) ?? metricasVazias();
    resultado.set(turno.funcionarioId, metricas);

    metricas.turnosPorPeriodo[turno.periodo]++;
    if (turno.periodo === "Manhã") metricas.aberturas++;
    if (turno.periodo === "Fechamento") metricas.fechamentos++;
    if (turno.diaSemana === 5) metricas.sabadosTrabalhados++;
    if (turno.diaSemana === 6) metricas.domingosTrabalhados++;
    metricas.horasPlanejadas += horasEfetivasDoTurno(
      turno.horaInicio,
      turno.horaFim
    );

    if (turno.diaSemana === 5 || turno.diaSemana === 6) {
      const semanasFuncionario = finsDeSemana.get(turno.funcionarioId) ?? new Map();
      finsDeSemana.set(turno.funcionarioId, semanasFuncionario);
      const dias = semanasFuncionario.get(turno.semanaInicio) ?? new Set<number>();
      semanasFuncionario.set(turno.semanaInicio, dias);
      dias.add(turno.diaSemana);
    }

    if (turno.semanaInicio === anterior) {
      const padrao = padroes.get(turno.funcionarioId) ?? new Set<string>();
      padroes.set(turno.funcionarioId, padrao);
      padrao.add(`${turno.diaSemana}:${turno.periodo}`);
    }
  }

  for (const [funcionarioId, metricas] of resultado) {
    metricas.finsDeSemanaCompletos = [...(finsDeSemana.get(funcionarioId)?.values() ?? [])]
      .filter((dias) => dias.has(5) && dias.has(6)).length;
    metricas.horasPlanejadas = Math.round(metricas.horasPlanejadas * 100) / 100;
    metricas.padraoSemanaAnterior = [...(padroes.get(funcionarioId) ?? [])].sort();
  }

  return resultado;
}
