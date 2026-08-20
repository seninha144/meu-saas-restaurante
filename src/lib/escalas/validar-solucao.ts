import { horasEfetivasDoTurno, paraMinutos } from "../horas.ts";
import { periodosAtravessados } from "./candidatos-turno.ts";
import { agruparMinimosPorFuncao, normalizarFuncao } from "./regras-obrigatorias.ts";
import type { HorarioSnapshot, SnapshotSemanal } from "./snapshot-semanal.ts";
import type { PeriodoOperacional } from "../../types/dominio.ts";
import type { SolucaoSemanal, TurnoSolucao } from "./solucao-semanal.ts";
import {
  horasExtrasPermitidas,
  limiteAutomaticoFuncionario,
} from "./limite-carga-semanal.ts";
import { MAX_HORAS_DIARIAS_AUTOMATICAS } from "./contexto-temporal.ts";

export type { SolucaoSemanal, TurnoSolucao } from "./solucao-semanal.ts";

const MINUTOS_DIA = 24 * 60;
const DESCANSO_MINIMO = 11 * 60;
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const PERIODOS: PeriodoOperacional[] = ["Abertura", "Almoço", "Tarde", "Fechamento"];
const FORMATO_HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type CodigoViolacao =
  | "DIA_FECHADO"
  | "HORARIO_INVALIDO"
  | "FORA_DA_OPERACAO"
  | "FUNCIONARIO_INEXISTENTE"
  | "FUNCIONARIO_INDISPONIVEL"
  | "ZONA_INCOMPATIVEL"
  | "SOBREPOSICAO"
  | "DESCANSO_INSUFICIENTE"
  | "SETE_DIAS_CONSECUTIVOS"
  | "LIMITE_CARGA_SEMANAL_EXCEDIDO"
  | "LIMITE_JORNADA_DIARIA_EXCEDIDO"
  | "COBERTURA_MINIMA"
  | "FUNCAO_MINIMA"
  | "ABERTURA_DESCOBERTA"
  | "FECHAMENTO_DESCOBERTO";

export interface ViolacaoHardConstraint {
  codigo: CodigoViolacao;
  mensagem: string;
  funcionarioId?: string;
  diaSemana?: number;
  periodo?: PeriodoOperacional;
  zonaId?: string | null;
  minimo?: number;
  encontrado?: number;
  cargaContratada?: number;
  horasPlanejadas?: number;
  horasExtrasPermitidas?: number;
  excessoHoras?: number;
  limiteHoras?: number;
}

export interface AvisoSolucao {
  codigo: "ABAIXO_IDEAL" | "ACIMA_MAXIMO" | "CARGA_ALVO";
  mensagem: string;
  funcionarioId?: string;
  diaSemana?: number;
  periodo?: PeriodoOperacional;
  zonaId?: string | null;
}

export interface MetricasSolucao {
  coberturaMinimaPercentual: number;
  coberturaMinimaNecessaria: number;
  coberturaMinimaEncontrada: number;
  distanciaParaIdeal: number;
  excessoAcimaMaximo: number;
  periodosAbaixoMinimo: number;
  funcoesAbaixoMinimo: number;
  horasPorFuncionario: Record<string, number>;
  aberturasPorFuncionario: Record<string, number>;
  fechamentosPorFuncionario: Record<string, number>;
}

export interface ResultadoValidacaoSolucao {
  valida: boolean;
  erros: ViolacaoHardConstraint[];
  avisos: AvisoSolucao[];
  metricas: MetricasSolucao;
}

interface TurnoNormalizado extends TurnoSolucao {
  inicio: number;
  fim: number;
  periodos: PeriodoOperacional[];
  elegivelParaCobertura: boolean;
}

function adicionarErro(
  erros: ViolacaoHardConstraint[],
  erro: ViolacaoHardConstraint
) {
  erros.push(erro);
}

function horarioDoDia(snapshot: SnapshotSemanal, diaSemana: number) {
  return snapshot.horarios.find((horario) => horario.diaSemana === diaSemana);
}

function intervaloOperacional(horario: HorarioSnapshot) {
  const inicio = paraMinutos(horario.abertura);
  let fim = paraMinutos(horario.fechamento);
  if (fim <= inicio) fim += MINUTOS_DIA;
  return { inicio, fim };
}

function intervaloTurnoNoHorario(
  horario: HorarioSnapshot,
  horaInicio: string,
  horaFim: string
) {
  const operacao = intervaloOperacional(horario);
  let inicio = paraMinutos(horaInicio);
  if (operacao.fim > MINUTOS_DIA && inicio < operacao.inicio) inicio += MINUTOS_DIA;
  let fim = paraMinutos(horaFim);
  while (fim <= inicio) fim += MINUTOS_DIA;
  return { inicio, fim, operacao };
}

function estaIndisponivel(
  snapshot: SnapshotSemanal,
  turno: TurnoSolucao,
  periodos: PeriodoOperacional[]
) {
  const mapa: Record<PeriodoOperacional, string> = {
    Abertura: "Manhã",
    Almoço: "Tarde",
    Tarde: "Noite",
    Fechamento: "Fechamento",
  };
  return snapshot.disponibilidades.some(
    (item) =>
      item.funcionarioId === turno.funcionarioId &&
      item.diaSemana === turno.diaSemana &&
      !item.disponivel &&
      (item.periodo === null ||
        item.periodo === "Total" ||
        periodos.some((periodo) => item.periodo === mapa[periodo]))
  );
}

function normalizarTurnos(
  snapshot: SnapshotSemanal,
  solucao: SolucaoSemanal,
  erros: ViolacaoHardConstraint[]
): TurnoNormalizado[] {
  return solucao.turnos.flatMap((turno) => {
    const horario = horarioDoDia(snapshot, turno.diaSemana);
    let elegivel = true;

    if (!horario || horario.fechado || !snapshot.diasAbertos.includes(turno.diaSemana)) {
      adicionarErro(erros, {
        codigo: "DIA_FECHADO",
        mensagem: `${DIAS[turno.diaSemana] ?? `Dia ${turno.diaSemana}`}: turno atribuído em dia fechado.`,
        funcionarioId: turno.funcionarioId,
        diaSemana: turno.diaSemana,
      });
      return [];
    }

    if (!FORMATO_HORA.test(turno.horaInicio) || !FORMATO_HORA.test(turno.horaFim)) {
      adicionarErro(erros, {
        codigo: "HORARIO_INVALIDO",
        mensagem: `Funcionário ${turno.funcionarioId}: horário de turno inválido.`,
        funcionarioId: turno.funcionarioId,
        diaSemana: turno.diaSemana,
      });
      return [];
    }

    const intervalo = intervaloTurnoNoHorario(horario, turno.horaInicio, turno.horaFim);
    const inicio = turno.diaSemana * MINUTOS_DIA + intervalo.inicio;
    const fim = turno.diaSemana * MINUTOS_DIA + intervalo.fim;
    const periodos = periodosAtravessados(horario, intervalo.inicio, intervalo.fim);

    if (
      intervalo.inicio < intervalo.operacao.inicio ||
      intervalo.fim > intervalo.operacao.fim ||
      intervalo.fim <= intervalo.inicio
    ) {
      adicionarErro(erros, {
        codigo: "FORA_DA_OPERACAO",
        mensagem: `${DIAS[turno.diaSemana]}: turno ${turno.horaInicio}–${turno.horaFim} fora de ${horario.abertura}–${horario.fechamento}.`,
        funcionarioId: turno.funcionarioId,
        diaSemana: turno.diaSemana,
      });
      elegivel = false;
    }

    const funcionario = snapshot.funcionarios.find((item) => item.id === turno.funcionarioId);
    if (!funcionario) {
      adicionarErro(erros, {
        codigo: "FUNCIONARIO_INEXISTENTE",
        mensagem: `Funcionário ${turno.funcionarioId} não existe ou não está ativo no snapshot.`,
        funcionarioId: turno.funcionarioId,
        diaSemana: turno.diaSemana,
      });
      elegivel = false;
    } else {
      const zonaEsperada = snapshot.restaurante.usaZonas ? funcionario.zonaId : null;
      const zonaExiste = !snapshot.restaurante.usaZonas || snapshot.zonas.some((zona) => zona.id === turno.zonaId);
      if (turno.zonaId !== zonaEsperada || !zonaExiste) {
        adicionarErro(erros, {
          codigo: "ZONA_INCOMPATIVEL",
          mensagem: `Funcionário ${turno.funcionarioId}: zona ${turno.zonaId ?? "geral"} incompatível.`,
          funcionarioId: turno.funcionarioId,
          diaSemana: turno.diaSemana,
          zonaId: turno.zonaId,
        });
        elegivel = false;
      }
    }

    if (estaIndisponivel(snapshot, turno, periodos)) {
      adicionarErro(erros, {
        codigo: "FUNCIONARIO_INDISPONIVEL",
        mensagem: `Funcionário ${turno.funcionarioId} indisponível em ${DIAS[turno.diaSemana]}.`,
        funcionarioId: turno.funcionarioId,
        diaSemana: turno.diaSemana,
      });
      elegivel = false;
    }

    return [{ ...turno, inicio, fim, periodos, elegivelParaCobertura: elegivel }];
  });
}

function validarSobreposicaoEDescanso(
  snapshot: SnapshotSemanal,
  turnos: TurnoNormalizado[],
  erros: ViolacaoHardConstraint[]
) {
  for (const funcionario of snapshot.funcionarios) {
    const atuais = turnos
      .filter((turno) => turno.funcionarioId === funcionario.id)
      .sort((a, b) => a.inicio - b.inicio);

    for (let indice = 1; indice < atuais.length; indice++) {
      const anterior = atuais[indice - 1];
      const atual = atuais[indice];
      if (atual.inicio < anterior.fim) {
        adicionarErro(erros, {
          codigo: "SOBREPOSICAO",
          mensagem: `Funcionário ${funcionario.id}: turnos sobrepostos em ${DIAS[atual.diaSemana]}.`,
          funcionarioId: funcionario.id,
          diaSemana: atual.diaSemana,
        });
      } else if (atual.inicio - anterior.fim < DESCANSO_MINIMO) {
        const descanso = Math.round(((atual.inicio - anterior.fim) / 60) * 100) / 100;
        adicionarErro(erros, {
          codigo: "DESCANSO_INSUFICIENTE",
          mensagem: `Funcionário ${funcionario.id}: descanso de ${descanso}h entre turnos; mínimo de 11h.`,
          funcionarioId: funcionario.id,
          diaSemana: atual.diaSemana,
        });
      }
    }

    const anteriores = snapshot.turnosSemanaAnterior
      .filter((turno) => turno.funcionarioId === funcionario.id && turno.horaInicio && turno.horaFim)
      .map((turno) => {
        const inicio = (turno.diaSemana - 7) * MINUTOS_DIA + paraMinutos(turno.horaInicio!);
        let fim = (turno.diaSemana - 7) * MINUTOS_DIA + paraMinutos(turno.horaFim!);
        while (fim <= inicio) fim += MINUTOS_DIA;
        return { inicio, fim };
      })
      .sort((a, b) => a.inicio - b.inicio);
    const ultimoAnterior = anteriores.at(-1);
    const primeiroAtual = atuais[0];
    if (ultimoAnterior && primeiroAtual && primeiroAtual.inicio - ultimoAnterior.fim < DESCANSO_MINIMO) {
      const descanso = Math.round(((primeiroAtual.inicio - ultimoAnterior.fim) / 60) * 100) / 100;
      adicionarErro(erros, {
        codigo: "DESCANSO_INSUFICIENTE",
        mensagem: `Funcionário ${funcionario.id}: descanso na fronteira semanal de ${descanso}h; mínimo de 11h.`,
        funcionarioId: funcionario.id,
        diaSemana: primeiroAtual.diaSemana,
      });
    }

    const dias = new Set([
      ...snapshot.turnosSemanaAnterior
        .filter((turno) => turno.funcionarioId === funcionario.id)
        .map((turno) => turno.diaSemana - 7),
      ...atuais.map((turno) => turno.diaSemana),
    ]);
    const ordenados = [...dias].sort((a, b) => a - b);
    let sequencia = 0;
    let anterior: number | null = null;
    for (const dia of ordenados) {
      sequencia = anterior !== null && dia === anterior + 1 ? sequencia + 1 : 1;
      if (sequencia > 6 && dia >= 0) {
        adicionarErro(erros, {
          codigo: "SETE_DIAS_CONSECUTIVOS",
          mensagem: `Funcionário ${funcionario.id}: mais de 6 dias consecutivos na fronteira da semana.`,
          funcionarioId: funcionario.id,
          diaSemana: dia,
        });
        break;
      }
      anterior = dia;
    }
  }
}

function multiplicadorMovimento(nivel: string) {
  return nivel === "baixo" ? 0.7 : nivel === "alto" ? 1.3 : nivel === "muito_alto" ? 1.6 : 1;
}

function necessidadeDoSlot(
  snapshot: SnapshotSemanal,
  diaSemana: number,
  periodo: PeriodoOperacional,
  zonaId: string | null
) {
  const candidatas = snapshot.necessidades.filter(
    (item) =>
      item.diaSemana === diaSemana &&
      item.periodo === periodo &&
      (item.zonaId === zonaId || item.zonaId === null)
  );
  const especificas = candidatas.filter((item) => item.zonaId === zonaId);
  const linhas = especificas.length > 0 ? especificas : candidatas.filter((item) => item.zonaId === null);

  if (linhas.length > 0) {
    return {
      minimo: linhas.reduce((total, item) => total + Math.max(0, item.minimo), 0),
      ideal: linhas.reduce((total, item) => total + Math.max(0, item.ideal), 0),
      maximo: linhas.reduce((total, item) => total + Math.max(0, item.maximo), 0),
      funcoes: linhas.filter((item) => item.funcao?.trim()),
    };
  }

  const capacidade = zonaId
    ? Math.max(1, snapshot.zonas.find((zona) => zona.id === zonaId)?.capacidadeMinima ?? 1)
    : 1;
  const movimento = snapshot.movimentos.find(
    (item) => item.diaSemana === diaSemana && item.periodo === periodo
  );
  const ideal = movimento ? Math.ceil(capacidade * multiplicadorMovimento(movimento.nivel)) : capacidade;
  return { minimo: movimento ? 1 : capacidade, ideal, maximo: ideal + (movimento ? 1 : 0), funcoes: [] };
}

function validarCobertura(
  snapshot: SnapshotSemanal,
  turnos: TurnoNormalizado[],
  erros: ViolacaoHardConstraint[],
  avisos: AvisoSolucao[],
  metricas: MetricasSolucao
) {
  const elegiveis = turnos.filter((turno) => turno.elegivelParaCobertura);
  const zonas = snapshot.restaurante.usaZonas ? snapshot.zonas.map((zona) => zona.id) : [null];

  for (const dia of snapshot.diasAbertos) {
    const horario = horarioDoDia(snapshot, dia);
    if (!horario || horario.fechado) continue;
    const operacao = intervaloOperacional(horario);
    const turnosDia = elegiveis.filter((turno) => turno.diaSemana === dia);

    const abertura = turnosDia.filter((turno) => {
      const funcionario = snapshot.funcionarios.find((item) => item.id === turno.funcionarioId);
      return turno.inicio - dia * MINUTOS_DIA === operacao.inicio && funcionario?.podeAbertura;
    });
    const fechamento = turnosDia.filter((turno) => {
      const funcionario = snapshot.funcionarios.find((item) => item.id === turno.funcionarioId);
      return turno.fim - dia * MINUTOS_DIA === operacao.fim && funcionario?.podeFechamento;
    });
    if (abertura.length === 0) {
      adicionarErro(erros, {
        codigo: "ABERTURA_DESCOBERTA",
        mensagem: `${DIAS[dia]} / Abertura: nenhum funcionário apto inicia às ${horario.abertura}.`,
        diaSemana: dia,
        periodo: "Abertura",
      });
    }
    if (fechamento.length === 0) {
      adicionarErro(erros, {
        codigo: "FECHAMENTO_DESCOBERTO",
        mensagem: `${DIAS[dia]} / Fechamento: nenhum funcionário apto encerra às ${horario.fechamento}.`,
        diaSemana: dia,
        periodo: "Fechamento",
      });
    }

    for (const zonaId of zonas) {
      for (const periodo of PERIODOS) {
        const necessidade = necessidadeDoSlot(snapshot, dia, periodo, zonaId);
        const cobertura = turnosDia.filter(
          (turno) => turno.zonaId === zonaId && turno.periodos.includes(periodo)
        );
        const encontrada = cobertura.length;
        metricas.coberturaMinimaNecessaria += necessidade.minimo;
        metricas.coberturaMinimaEncontrada += Math.min(encontrada, necessidade.minimo);
        metricas.distanciaParaIdeal += Math.max(0, necessidade.ideal - encontrada);
        metricas.excessoAcimaMaximo += Math.max(0, encontrada - necessidade.maximo);

        if (encontrada < necessidade.minimo) {
          metricas.periodosAbaixoMinimo++;
          adicionarErro(erros, {
            codigo: "COBERTURA_MINIMA",
            mensagem: `${DIAS[dia]} / ${periodo}: mínimo ${necessidade.minimo}, encontrado ${encontrada}.`,
            diaSemana: dia,
            periodo,
            zonaId,
            minimo: necessidade.minimo,
            encontrado: encontrada,
          });
        } else if (encontrada < necessidade.ideal) {
          avisos.push({
            codigo: "ABAIXO_IDEAL",
            mensagem: `${DIAS[dia]} / ${periodo}: ideal ${necessidade.ideal}, encontrado ${encontrada}.`,
            diaSemana: dia,
            periodo,
            zonaId,
          });
        }
        if (encontrada > necessidade.maximo) {
          avisos.push({
            codigo: "ACIMA_MAXIMO",
            mensagem: `${DIAS[dia]} / ${periodo}: máximo ${necessidade.maximo}, encontrado ${encontrada}.`,
            diaSemana: dia,
            periodo,
            zonaId,
          });
        }

        for (const [funcao, minimo] of agruparMinimosPorFuncao(necessidade.funcoes)) {
          const encontrados = cobertura.filter((turno) => {
            const funcionario = snapshot.funcionarios.find((item) => item.id === turno.funcionarioId);
            return funcionario && normalizarFuncao(funcionario.cargo) === funcao;
          }).length;
          if (encontrados < minimo) {
            metricas.funcoesAbaixoMinimo++;
            adicionarErro(erros, {
              codigo: "FUNCAO_MINIMA",
              mensagem: `${DIAS[dia]} / ${periodo} / ${funcao}: mínimo ${minimo}, encontrado ${encontrados}.`,
              diaSemana: dia,
              periodo,
              zonaId,
              minimo,
              encontrado: encontrados,
            });
          }
        }
      }
    }
  }
}

export function validarSolucao(
  snapshot: SnapshotSemanal,
  solucao: SolucaoSemanal
): ResultadoValidacaoSolucao {
  const erros: ViolacaoHardConstraint[] = [];
  const avisos: AvisoSolucao[] = [];
  const metricas: MetricasSolucao = {
    coberturaMinimaPercentual: 100,
    coberturaMinimaNecessaria: 0,
    coberturaMinimaEncontrada: 0,
    distanciaParaIdeal: 0,
    excessoAcimaMaximo: 0,
    periodosAbaixoMinimo: 0,
    funcoesAbaixoMinimo: 0,
    horasPorFuncionario: {},
    aberturasPorFuncionario: {},
    fechamentosPorFuncionario: {},
  };
  const turnos = normalizarTurnos(snapshot, solucao, erros);

  validarSobreposicaoEDescanso(snapshot, turnos, erros);

  for (const funcionario of snapshot.funcionarios) {
    const turnosFuncionario = turnos.filter((turno) => turno.funcionarioId === funcionario.id);
    for (const diaSemana of new Set(turnosFuncionario.map((turno) => turno.diaSemana))) {
      const horasDia = turnosFuncionario
        .filter((turno) => turno.diaSemana === diaSemana)
        .reduce(
          (total, turno) => total + horasEfetivasDoTurno(
            turno.horaInicio,
            turno.horaFim,
            funcionario.pausaAlmocoMinutos
          ),
          0
        );
      if (Math.round(horasDia * 60) > MAX_HORAS_DIARIAS_AUTOMATICAS * 60) {
        const excessoHoras = Math.round((horasDia - MAX_HORAS_DIARIAS_AUTOMATICAS) * 100) / 100;
        adicionarErro(erros, {
          codigo: "LIMITE_JORNADA_DIARIA_EXCEDIDO",
          mensagem: `Funcionário ${funcionario.id}, ${DIAS[diaSemana]}: ${Math.round(horasDia * 100) / 100}h planejadas, limite ${MAX_HORAS_DIARIAS_AUTOMATICAS}h, excesso ${excessoHoras}h.`,
          funcionarioId: funcionario.id,
          diaSemana,
          horasPlanejadas: Math.round(horasDia * 100) / 100,
          limiteHoras: MAX_HORAS_DIARIAS_AUTOMATICAS,
          excessoHoras,
        });
      }
    }
    const horas = turnosFuncionario.reduce(
      (total, turno) => total + horasEfetivasDoTurno(turno.horaInicio, turno.horaFim, funcionario.pausaAlmocoMinutos),
      0
    );
    metricas.horasPorFuncionario[funcionario.id] = Math.round(horas * 100) / 100;
    const extrasPermitidas = horasExtrasPermitidas(snapshot.restaurante, funcionario);
    const limiteAutomatico = limiteAutomaticoFuncionario(snapshot.restaurante, funcionario);
    const excessoMinutos = Math.round(horas * 60) - Math.round(limiteAutomatico * 60);
    if (excessoMinutos > 0) {
      const excessoHoras = Math.round((excessoMinutos / 60) * 100) / 100;
      adicionarErro(erros, {
        codigo: "LIMITE_CARGA_SEMANAL_EXCEDIDO",
        mensagem: `Funcionário ${funcionario.id}: contrato ${funcionario.cargaHorariaSemanalMax}h, permitido +${extrasPermitidas}h, planejado ${Math.round(horas * 100) / 100}h, excesso inválido ${excessoHoras}h.`,
        funcionarioId: funcionario.id,
        cargaContratada: funcionario.cargaHorariaSemanalMax,
        horasPlanejadas: Math.round(horas * 100) / 100,
        horasExtrasPermitidas: extrasPermitidas,
        excessoHoras,
      });
    }
    metricas.aberturasPorFuncionario[funcionario.id] = turnosFuncionario.filter((turno) => {
      const horario = horarioDoDia(snapshot, turno.diaSemana);
      return horario && turno.horaInicio === horario.abertura && funcionario.podeAbertura;
    }).length;
    metricas.fechamentosPorFuncionario[funcionario.id] = turnosFuncionario.filter((turno) => {
      const horario = horarioDoDia(snapshot, turno.diaSemana);
      return horario && turno.horaFim === horario.fechamento && funcionario.podeFechamento;
    }).length;
    if (Math.abs(horas - funcionario.cargaHorariaSemanalMax) > 0.01) {
      avisos.push({
        codigo: "CARGA_ALVO",
        mensagem: `Funcionário ${funcionario.id}: ${Math.round(horas * 100) / 100}h para alvo atual de ${funcionario.cargaHorariaSemanalMax}h.`,
        funcionarioId: funcionario.id,
      });
    }
  }

  validarCobertura(snapshot, turnos, erros, avisos, metricas);
  metricas.coberturaMinimaPercentual = metricas.coberturaMinimaNecessaria > 0
    ? Math.round((metricas.coberturaMinimaEncontrada / metricas.coberturaMinimaNecessaria) * 10000) / 100
    : 100;

  return { valida: erros.length === 0, erros, avisos, metricas };
}
