import { dividirIntervalo, formatarHoraDoDia, intervaloEmMinutos } from "../horas.ts";
import {
  PERIODOS_OPERACIONAIS,
  type PeriodoOperacional,
} from "../../types/dominio.ts";
import type {
  FuncionarioSnapshot,
  HorarioSnapshot,
  SnapshotSemanal,
} from "./snapshot-semanal.ts";
import {
  inicioAutomaticoPermitido,
  MAX_MINUTOS_DIARIOS_AUTOMATICOS,
} from "./contexto-temporal.ts";

const MINUTOS_DIA = 24 * 60;
const DURACAO_MINIMA_MINUTOS = 60;

export interface TurnoCandidato {
  id: string;
  funcionarioId: string;
  diaSemana: number;
  zonaId: string | null;
  horaInicio: string;
  horaFim: string;
  inicioMinutosAbsolutos: number;
  fimMinutosAbsolutos: number;
  duracaoMinutos: number;
  periodosOperacionais: PeriodoOperacional[];
  funcao: string;
  cobreAbertura: boolean;
  cobreFechamento: boolean;
}

interface FaixaOperacional {
  periodo: PeriodoOperacional;
  inicio: number;
  fim: number;
}

function faixasOperacionais(horario: HorarioSnapshot): FaixaOperacional[] {
  const { inicio, fim } = intervaloEmMinutos(horario.abertura, horario.fechamento);
  const inicios = dividirIntervalo(
    horario.abertura,
    horario.fechamento,
    PERIODOS_OPERACIONAIS.length
  ).map(Math.round);

  return PERIODOS_OPERACIONAIS.map((periodo, indice) => ({
    periodo,
    inicio: inicios[indice],
    fim: indice === PERIODOS_OPERACIONAIS.length - 1 ? fim : inicios[indice + 1],
  })).filter((faixa) => faixa.inicio < faixa.fim && faixa.inicio >= inicio && faixa.fim <= fim);
}

export function periodosAtravessados(
  horario: HorarioSnapshot,
  inicioTurno: number,
  fimTurno: number
): PeriodoOperacional[] {
  return faixasOperacionais(horario)
    .filter((faixa) => inicioTurno < faixa.fim && fimTurno > faixa.inicio)
    .map((faixa) => faixa.periodo);
}

function limiteDuracaoFuncionario(
  funcionario: FuncionarioSnapshot,
  duracaoOperacao: number
): number {
  const jornadaBase =
    funcionario.cargaHorariaSemanalMax > 0
      ? (funcionario.cargaHorariaSemanalMax * 60) / Math.max(1, funcionario.diasTrabalhoAlvo)
      : 0;

  return Math.min(
    duracaoOperacao,
    MAX_MINUTOS_DIARIOS_AUTOMATICOS + funcionario.pausaAlmocoMinutos,
    Math.max(DURACAO_MINIMA_MINUTOS, jornadaBase + funcionario.pausaAlmocoMinutos)
  );
}

function funcionarioDisponivel(
  snapshot: SnapshotSemanal,
  funcionarioId: string,
  diaSemana: number,
  periodos: PeriodoOperacional[]
): boolean {
  const indisponibilidades = snapshot.disponibilidades.filter(
    (item) =>
      item.funcionarioId === funcionarioId &&
      item.diaSemana === diaSemana &&
      !item.disponivel
  );

  if (indisponibilidades.some((item) => item.periodo === null || item.periodo === "Total")) {
    return false;
  }

  const disponibilidadePorPeriodo: Record<PeriodoOperacional, string> = {
    Abertura: "Manhã",
    Almoço: "Tarde",
    Tarde: "Noite",
    Fechamento: "Fechamento",
  };

  return !indisponibilidades.some((item) =>
    periodos.some((periodo) => item.periodo === disponibilidadePorPeriodo[periodo])
  );
}

function zonaValida(snapshot: SnapshotSemanal, funcionario: FuncionarioSnapshot): boolean {
  if (!snapshot.restaurante.usaZonas) return true;
  if (!funcionario.zonaId) return false;
  return snapshot.zonas.some((zona) => zona.id === funcionario.zonaId);
}

function candidatosDoDia(
  snapshot: SnapshotSemanal,
  funcionario: FuncionarioSnapshot,
  horario: HorarioSnapshot
): TurnoCandidato[] {
  if (horario.fechado || !snapshot.diasAbertos.includes(horario.diaSemana)) return [];
  if (!zonaValida(snapshot, funcionario)) return [];

  const operacao = intervaloEmMinutos(horario.abertura, horario.fechamento);
  const duracaoOperacao = operacao.fim - operacao.inicio;
  if (duracaoOperacao < DURACAO_MINIMA_MINUTOS) return [];

  const faixas = faixasOperacionais(horario);
  const limites = [...new Set([
    operacao.inicio,
    ...faixas.map((faixa) => faixa.inicio),
    ...faixas.map((faixa) => faixa.fim),
    operacao.fim,
  ])].sort((a, b) => a - b);
  const duracaoMaxima = limiteDuracaoFuncionario(funcionario, duracaoOperacao);
  const candidatos: TurnoCandidato[] = [];

  for (let indiceInicio = 0; indiceInicio < limites.length - 1; indiceInicio++) {
    for (let indiceFim = indiceInicio + 1; indiceFim < limites.length; indiceFim++) {
      const inicio = limites[indiceInicio];
      const fim = limites[indiceFim];
      const duracao = fim - inicio;
      if (duracao < DURACAO_MINIMA_MINUTOS || duracao > duracaoMaxima) continue;
      if (
        snapshot.temporal &&
        !inicioAutomaticoPermitido(snapshot.temporal, horario.diaSemana, inicio)
      ) continue;

      const periodos = periodosAtravessados(horario, inicio, fim);
      if (periodos.length === 0) continue;
      if (!funcionarioDisponivel(snapshot, funcionario.id, horario.diaSemana, periodos)) continue;

      const zonaId = snapshot.restaurante.usaZonas ? funcionario.zonaId : null;
      const inicioAbsoluto = horario.diaSemana * MINUTOS_DIA + inicio;
      const fimAbsoluto = horario.diaSemana * MINUTOS_DIA + fim;
      const horaInicio = formatarHoraDoDia(inicio);
      const horaFim = formatarHoraDoDia(fim);

      candidatos.push({
        id: `${funcionario.id}:${horario.diaSemana}:${horaInicio}-${horaFim}:${zonaId ?? "sem-zona"}`,
        funcionarioId: funcionario.id,
        diaSemana: horario.diaSemana,
        zonaId,
        horaInicio,
        horaFim,
        inicioMinutosAbsolutos: inicioAbsoluto,
        fimMinutosAbsolutos: fimAbsoluto,
        duracaoMinutos: duracao,
        periodosOperacionais: periodos,
        funcao: funcionario.cargo,
        cobreAbertura: inicio === operacao.inicio && funcionario.podeAbertura,
        cobreFechamento: fim === operacao.fim && funcionario.podeFechamento,
      });
    }
  }

  return candidatos;
}

export function gerarCandidatosTurno(snapshot: SnapshotSemanal): TurnoCandidato[] {
  const horarios = [...snapshot.horarios].sort((a, b) => a.diaSemana - b.diaSemana);
  const funcionarios = [...snapshot.funcionarios].sort((a, b) => a.id.localeCompare(b.id));

  return funcionarios.flatMap((funcionario) =>
    horarios.flatMap((horario) => candidatosDoDia(snapshot, funcionario, horario))
  );
}
