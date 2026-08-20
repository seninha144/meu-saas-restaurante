import type { Periodo } from "@/types/dominio";
import type { TurnoHistorico } from "./historico";
import { criarContextoTemporalSemanal, type ContextoTemporalSemanal } from "./contexto-temporal.ts";

export interface RestauranteSnapshot {
  id: string;
  usaZonas: boolean;
  permiteIa: boolean;
  diasFuncionamento: number[];
  coberturaFdsPrioritaria: boolean;
  permiteHorarioRepartido: boolean;
  permiteHorasExtras: boolean;
  limiteHorasExtrasSemanais: number;
  fusoHorario?: string;
}

export interface SemanaSnapshot {
  escalaId: string;
  inicio: string;
  fim: string;
}

export interface HorarioSnapshot {
  diaSemana: number;
  fechado: boolean;
  abertura: string;
  fechamento: string;
}

export interface ZonaSnapshot {
  id: string;
  capacidadeMinima: number;
}

export interface FuncionarioSnapshot {
  id: string;
  cargo: string;
  zonaId: string | null;
  cargaHorariaSemanalMax: number;
  pausaAlmocoMinutos: number;
  diasTrabalhoAlvo: number;
  podeAbertura: boolean;
  podeFechamento: boolean;
  aceitaHorarioRepartido: boolean;
  aceitaHorasExtras: boolean;
}

export interface DisponibilidadeSnapshot {
  funcionarioId: string;
  diaSemana: number;
  disponivel: boolean;
  periodo: string | null;
}

export interface MovimentoSnapshot {
  diaSemana: number;
  periodo: string;
  nivel: string;
}

export interface NecessidadeSnapshot {
  diaSemana: number;
  periodo: string;
  zonaId: string | null;
  funcao: string | null;
  minimo: number;
  ideal: number;
  maximo: number;
}

export interface TurnoExistenteSnapshot {
  id: string;
  funcionarioId: string;
  zonaId: string | null;
  diaSemana: number;
  periodo: Periodo;
  horaInicio: string | null;
  horaFim: string | null;
}

export interface SnapshotSemanal {
  restaurante: RestauranteSnapshot;
  semana: SemanaSnapshot;
  horarios: HorarioSnapshot[];
  diasAbertos: number[];
  diasFechados: number[];
  zonas: ZonaSnapshot[];
  funcionarios: FuncionarioSnapshot[];
  cargos: string[];
  disponibilidades: DisponibilidadeSnapshot[];
  movimentos: MovimentoSnapshot[];
  necessidades: NecessidadeSnapshot[];
  turnosExistentes: TurnoExistenteSnapshot[];
  historicoQuatroSemanas: TurnoHistorico[];
  turnosSemanaAnterior: TurnoHistorico[];
  temporal?: ContextoTemporalSemanal;
}

export interface EntradaSnapshotSemanal {
  restaurante: {
    id: string;
    usa_zonas: boolean | null;
    permite_ia: boolean | null;
    dias_funcionamento: number[] | null;
    cobertura_fds_prioritaria: boolean | null;
    permite_horario_repartido: boolean | null;
    permite_horas_extras: boolean | null;
    limite_horas_extras_semanais: number | null;
    fuso_horario?: string | null;
  } | null;
  escala: { id: string; semana_inicio: string; semana_fim: string };
  horarios: Array<{
    dia_semana: number;
    fechado: boolean;
    hora_abertura: string | null;
    hora_fechamento: string | null;
  }>;
  zonas: Array<{ id: string; capacidade_minima: number }>;
  funcionarios: Array<{
    id: string;
    cargo: string;
    zona_id: string | null;
    carga_horaria_semanal_max: number;
    folgas_obrigatorias_semana: number;
    pausa_almoco_minutos: number;
    pode_abertura: boolean;
    pode_fechamento: boolean;
    aceita_horario_repartido: boolean;
    aceita_horas_extras: boolean;
  }>;
  disponibilidades: Array<{
    funcionario_id: string;
    dia_semana: number;
    disponivel: boolean;
    periodo: string | null;
  }>;
  movimentos: Array<{ dia_semana: number; periodo: string; nivel: string }>;
  necessidades: Array<{
    dia_semana: number;
    periodo: string;
    zona_id: string | null;
    funcao: string | null;
    minimo: number;
    ideal: number;
    maximo: number;
  }>;
  turnosExistentes: Array<{
    id: string;
    funcionario_id: string;
    zona_id: string | null;
    dia_semana: number;
    periodo: string;
    hora_inicio: string | null;
    hora_fim: string | null;
  }>;
  escalasHistoricas: Array<{ id: string; semana_inicio: string }>;
  turnosHistoricos: Array<{
    escala_id: string;
    funcionario_id: string;
    dia_semana: number;
    periodo: string;
    hora_inicio: string | null;
    hora_fim: string | null;
  }>;
  agoraReferencia?: string;
}

function semanaAnterior(semanaInicio: string): string {
  const data = new Date(`${semanaInicio}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 7);
  return data.toISOString().slice(0, 10);
}

export function normalizarSnapshotSemanal(entrada: EntradaSnapshotSemanal): SnapshotSemanal {
  const diasFuncionamento = entrada.restaurante?.dias_funcionamento ?? [0, 1, 2, 3, 4, 5, 6];
  const horariosPorDia = new Map(entrada.horarios.map((horario) => [horario.dia_semana, horario]));
  const diasAbertos = diasFuncionamento.filter(
    (dia) => !(horariosPorDia.get(dia)?.fechado ?? false)
  );
  const semanasPorEscala = new Map(
    entrada.escalasHistoricas.map((escala) => [escala.id, escala.semana_inicio])
  );
  const historicoQuatroSemanas: TurnoHistorico[] = entrada.turnosHistoricos.flatMap((turno) => {
    const semanaInicio = semanasPorEscala.get(turno.escala_id);
    if (!semanaInicio) return [];
    return [{
      funcionarioId: turno.funcionario_id,
      semanaInicio,
      diaSemana: turno.dia_semana,
      periodo: turno.periodo as Periodo,
      horaInicio: turno.hora_inicio,
      horaFim: turno.hora_fim,
    }];
  });
  const anterior = semanaAnterior(entrada.escala.semana_inicio);
  const funcionarios = entrada.funcionarios.map((funcionario) => ({
    id: funcionario.id,
    cargo: funcionario.cargo ?? "",
    zonaId: funcionario.zona_id,
    cargaHorariaSemanalMax: Number(funcionario.carga_horaria_semanal_max),
    pausaAlmocoMinutos: funcionario.pausa_almoco_minutos ?? 30,
    podeAbertura: funcionario.pode_abertura ?? true,
    podeFechamento: funcionario.pode_fechamento ?? true,
    aceitaHorarioRepartido: funcionario.aceita_horario_repartido ?? false,
    aceitaHorasExtras: funcionario.aceita_horas_extras ?? false,
    diasTrabalhoAlvo: Math.max(
      0,
      Math.min(7 - Number(funcionario.folgas_obrigatorias_semana), diasFuncionamento.length)
    ),
  }));

  return {
    restaurante: {
      id: entrada.restaurante?.id ?? "",
      usaZonas: entrada.restaurante?.usa_zonas ?? true,
      permiteIa: entrada.restaurante?.permite_ia ?? true,
      diasFuncionamento,
      coberturaFdsPrioritaria: entrada.restaurante?.cobertura_fds_prioritaria ?? false,
      permiteHorarioRepartido: entrada.restaurante?.permite_horario_repartido ?? false,
      permiteHorasExtras: entrada.restaurante?.permite_horas_extras ?? false,
      limiteHorasExtrasSemanais: entrada.restaurante?.permite_horas_extras
        ? Number(entrada.restaurante.limite_horas_extras_semanais ?? 0)
        : 0,
      fusoHorario: entrada.restaurante?.fuso_horario || "Europe/Lisbon",
    },
    semana: {
      escalaId: entrada.escala.id,
      inicio: entrada.escala.semana_inicio,
      fim: entrada.escala.semana_fim,
    },
    horarios: entrada.horarios.map((horario) => ({
      diaSemana: horario.dia_semana,
      fechado: horario.fechado,
      abertura: horario.hora_abertura?.slice(0, 5) ?? "09:00",
      fechamento: horario.hora_fechamento?.slice(0, 5) ?? "23:00",
    })),
    diasAbertos,
    diasFechados: Array.from({ length: 7 }, (_, dia) => dia).filter(
      (dia) => !diasAbertos.includes(dia)
    ),
    zonas: entrada.zonas.map((zona) => ({
      id: zona.id,
      capacidadeMinima: zona.capacidade_minima,
    })),
    funcionarios,
    cargos: [...new Set(funcionarios.map((funcionario) => funcionario.cargo.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt")),
    disponibilidades: entrada.disponibilidades.map((item) => ({
      funcionarioId: item.funcionario_id,
      diaSemana: item.dia_semana,
      disponivel: item.disponivel,
      periodo: item.periodo,
    })),
    movimentos: entrada.movimentos.map((item) => ({
      diaSemana: item.dia_semana,
      periodo: item.periodo,
      nivel: item.nivel,
    })),
    necessidades: entrada.necessidades.map((item) => ({
      diaSemana: item.dia_semana,
      periodo: item.periodo,
      zonaId: item.zona_id,
      funcao: item.funcao,
      minimo: item.minimo,
      ideal: item.ideal,
      maximo: item.maximo,
    })),
    turnosExistentes: entrada.turnosExistentes.map((turno) => ({
      id: turno.id,
      funcionarioId: turno.funcionario_id,
      zonaId: turno.zona_id,
      diaSemana: turno.dia_semana,
      periodo: turno.periodo as Periodo,
      horaInicio: turno.hora_inicio,
      horaFim: turno.hora_fim,
    })),
    historicoQuatroSemanas,
    turnosSemanaAnterior: historicoQuatroSemanas.filter(
      (turno) => turno.semanaInicio === anterior
    ),
    temporal: criarContextoTemporalSemanal(
      entrada.escala.semana_inicio,
      entrada.agoraReferencia ? new Date(entrada.agoraReferencia) : new Date(),
      entrada.restaurante?.fuso_horario || "Europe/Lisbon"
    ),
  };
}

/** Adaptador temporário: mantém o gerador atual sem mudanças algorítmicas. */
export function adaptarSnapshotParaGeradorAtual(snapshot: SnapshotSemanal) {
  return {
    restaurante: {
      usa_zonas: snapshot.restaurante.usaZonas,
      permite_ia: snapshot.restaurante.permiteIa,
      dias_funcionamento: snapshot.restaurante.diasFuncionamento,
      cobertura_fds_prioritaria: snapshot.restaurante.coberturaFdsPrioritaria,
      permite_horas_extras: snapshot.restaurante.permiteHorasExtras,
      limite_horas_extras_semanais: snapshot.restaurante.limiteHorasExtrasSemanais,
      fuso_horario: snapshot.restaurante.fusoHorario,
    },
    horariosPorDia: new Map(
      snapshot.horarios.map((horario) => [
        horario.diaSemana,
        {
          fechado: horario.fechado,
          abertura: horario.abertura,
          fechamento: horario.fechamento,
        },
      ])
    ),
    zonas: snapshot.zonas.map((zona) => ({
      id: zona.id,
      capacidade_minima: zona.capacidadeMinima,
    })),
    funcionarios: snapshot.funcionarios,
    disponibilidades: snapshot.disponibilidades.map((item) => ({
      funcionario_id: item.funcionarioId,
      dia_semana: item.diaSemana,
      disponivel: item.disponivel,
      periodo: item.periodo,
    })),
    movimentos: snapshot.movimentos.map((item) => ({
      dia_semana: item.diaSemana,
      periodo: item.periodo,
      nivel: item.nivel,
    })),
    necessidades: snapshot.necessidades.map((item) => ({
      dia_semana: item.diaSemana,
      periodo: item.periodo,
      zona_id: item.zonaId,
      funcao: item.funcao,
      minimo: item.minimo,
      ideal: item.ideal,
      maximo: item.maximo,
    })),
    turnosExistentes: snapshot.turnosExistentes.map((turno) => ({
      id: turno.id,
      funcionario_id: turno.funcionarioId,
      zona_id: turno.zonaId,
      dia_semana: turno.diaSemana,
      periodo: turno.periodo,
      hora_inicio: turno.horaInicio,
      hora_fim: turno.horaFim,
    })),
  };
}
