"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { horasEfetivasDoTurno } from "@/lib/horas";
import { getInicioSemana, toISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { PERIODOS, type Periodo } from "@/types/dominio";

/**
 * ==========================================================
 * CONSTANTES
 * ==========================================================
 */

/**
 * O índice dos dias usado pelo sistema é:
 *
 * 0 = Segunda
 * 1 = Terça
 * 2 = Quarta
 * 3 = Quinta
 * 4 = Sexta
 * 5 = Sábado
 * 6 = Domingo
 */
const SEGUNDA = 0;
const SEXTA = 4;
const SABADO = 5;
const DOMINGO = 6;

/**
 * Descanso mínimo entre dois turnos.
 *
 * Exemplo:
 *
 * Sábado 14:00 -> 23:00
 * Domingo 09:00 -> 18:00
 *
 * Descanso = 10h
 *
 * Não permitimos.
 */
const DESCANSO_MINIMO_MINUTOS = 11 * 60;

/**
 * Abaixo disso continuamos considerando o turno
 * tecnicamente possível, mas penalizamos fortemente.
 *
 * Exemplo:
 *
 * 23:00 -> 10:00 = 11h
 * 23:00 -> 12:00 = 13h
 *
 * O segundo cenário é humanamente melhor.
 */
const DESCANSO_IDEAL_MINUTOS = 13 * 60;

/**
 * Alta demanda continua sendo uma opção manual
 * enquanto ainda não temos o modelo de demanda
 * configurável pelo restaurante.
 */
const MULTIPLICADOR_COBERTURA_EVENTO = 1.5;

/**
 * Tipos de disponibilidade existentes na tabela
 * disponibilidades.
 *
 * IMPORTANTE:
 *
 * "Total" NÃO pertence aos turnos.
 */
type PeriodoDisponibilidade =
  | "Manhã"
  | "Tarde"
  | "Fechamento"
  | "Total";

/**
 * ==========================================================
 * ESTADO DA GERAÇÃO
 * ==========================================================
 */

export interface GerarEscalaState {
  erro?: string;

  turnosGerados?: number;

  turnosSubstituidos?: number;

  vagasSemCandidato?: number;

  diasProtegidos?: number;

  horasNaoAlocadas?: number;

  funcionariosComMetaIncompleta?: number;

  /**
   * Mantemos os dois nomes porque versões diferentes
   * da interface já utilizaram propriedades diferentes.
   */
  confirmarSemanaSeguinte?: boolean;

  requerSemanaSeguinte?: boolean;

  semanaInicioGerada?: string;
}

/**
 * ==========================================================
 * TIPOS INTERNOS
 * ==========================================================
 */

interface PerfilFuncionario {
  id: string;

  zonaId: string | null;

  cargaHorariaSemanalMax: number;

  pausaAlmocoMinutos: number;

  diasTrabalhoAlvo: number;
}

interface HorarioDia {
  fechado: boolean;

  abertura: string;

  fechamento: string;
}

interface TurnoNovo {
  restaurante_id: string;

  escala_id: string;

  funcionario_id: string;

  zona_id: string | null;

  dia_semana: number;

  periodo: Periodo;

  hora_inicio: string;

  hora_fim: string;

  fora_preferencia: boolean;

  status: "agendado";
}

interface TurnoMemoria {
  funcionario_id: string;

  dia_semana: number;

  periodo: Periodo;

  hora_inicio: string;

  hora_fim: string;

  zona_id: string | null;
}

interface SlotNecessidade {
  zonaId: string | null;

  dia: number;

  periodo: Periodo;

  capacidade: number;

  preenchido: number;
}

/**
 * ==========================================================
 * FUNÇÕES UTILITÁRIAS
 * ==========================================================
 */

function paraMinutos(hora: string): number {
  const [h, m] = hora
    .slice(0, 5)
    .split(":")
    .map(Number);

  return h * 60 + (m || 0);
}

function paraHora(minutos: number): string {
  const normalizado = Math.max(
    0,
    Math.round(minutos)
  );

  return `${String(
    Math.floor(normalizado / 60)
  ).padStart(2, "0")}:${String(
    normalizado % 60
  ).padStart(2, "0")}`;
}

function paraISODateUTC(data: Date): string {
  return `${data.getUTCFullYear()}-${String(
    data.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(
    data.getUTCDate()
  ).padStart(2, "0")}`;
}

function arredondar(horas: number): number {
  return Math.round(horas * 100) / 100;
}

/**
 * Retorna apenas os períodos que são realmente
 * períodos de turno.
 *
 * Se futuramente "Total" entrar no tipo Periodo
 * por acidente, ele será excluído daqui.
 */
const PERIODOS_TURNO: Periodo[] = [
  ...PERIODOS,
].filter(
  (periodo) =>
    periodo !== ("Total" as Periodo)
);

/**
 * ==========================================================
 * PERÍODOS / DISPONIBILIDADES
 * ==========================================================
 */

function ehPeriodoDisponibilidade(
  valor: string | null
): valor is PeriodoDisponibilidade {
  return (
    valor === "Manhã" ||
    valor === "Tarde" ||
    valor === "Fechamento" ||
    valor === "Total"
  );
}

function ehPeriodoTurno(
  valor: string | null
): valor is Periodo {
  return PERIODOS_TURNO.includes(
    valor as Periodo
  );
}

/**
 * Uma disponibilidade específica representa
 * uma preferência.
 *
 * Não transforma Manhã/Tarde/Fechamento numa
 * restrição absoluta.
 */
function periodosPreferidos(
  disponibilidades: Array<{
    funcionario_id: string;
    dia_semana: number;
    disponivel: boolean;
    periodo: string | null;
  }>,
  funcionarioId: string,
  dia: number
): Periodo[] {
  return disponibilidades
    .filter(
      (item) =>
        item.funcionario_id ===
          funcionarioId &&
        item.dia_semana === dia &&
        item.disponivel &&
        ehPeriodoDisponibilidade(
          item.periodo
        ) &&
        item.periodo !== "Total" &&
        ehPeriodoTurno(item.periodo)
    )
    .map(
      (item) =>
        item.periodo as Periodo
    );
}

function possuiDisponibilidadeTotal(
  disponibilidades: Array<{
    funcionario_id: string;
    dia_semana: number;
    disponivel: boolean;
    periodo: string | null;
  }>,
  funcionarioId: string,
  dia: number
): boolean {
  return disponibilidades.some(
    (item) =>
      item.funcionario_id ===
        funcionarioId &&
      item.dia_semana === dia &&
      item.disponivel &&
      item.periodo === "Total"
  );
}

function indisponivelNoDia(
  disponibilidades: Array<{
    funcionario_id: string;
    dia_semana: number;
    disponivel: boolean;
    periodo: string | null;
  }>,
  funcionarioId: string,
  dia: number
): boolean {
  return disponibilidades.some(
    (item) =>
      item.funcionario_id ===
        funcionarioId &&
      item.dia_semana === dia &&
      item.disponivel === false &&
      item.periodo === null
  );
}

function periodoIndisponivel(
  disponibilidades: Array<{
    funcionario_id: string;
    dia_semana: number;
    disponivel: boolean;
    periodo: string | null;
  }>,
  funcionarioId: string,
  dia: number,
  periodo: Periodo
): boolean {
  return disponibilidades.some(
    (item) =>
      item.funcionario_id ===
        funcionarioId &&
      item.dia_semana === dia &&
      item.disponivel === false &&
      item.periodo === periodo
  );
}

/**
 * ==========================================================
 * HORÁRIO DO RESTAURANTE
 * ==========================================================
 */

/**
 * Divide o horário REAL do restaurante entre os
 * períodos operacionais.
 *
 * NÃO existem horários fixos aqui.
 */
function inicioDosPeriodos(
  abertura: string,
  fechamento: string
): Record<Periodo, number> {
  const inicio =
    paraMinutos(abertura);

  const fim =
    paraMinutos(fechamento);

  const quantidade =
    Math.max(
      PERIODOS_TURNO.length,
      1
    );

  const bloco =
    Math.max(
      fim - inicio,
      quantidade * 30
    ) / quantidade;

  return PERIODOS_TURNO.reduce(
    (resultado, periodo, indice) => {
      resultado[periodo] =
        inicio + bloco * indice;

      return resultado;
    },
    {} as Record<Periodo, number>
  );
}

/**
 * ==========================================================
 * DATA / CALENDÁRIO
 * ==========================================================
 */

/**
 * O sistema trabalha com semana iniciando na segunda.
 *
 * Esta função converte o getUTCDay() nativo:
 *
 * Domingo = 0
 * Segunda = 1
 * ...
 * Sábado = 6
 *
 * para:
 *
 * Segunda = 0
 * ...
 * Domingo = 6
 */
function diaSistemaDaData(
  data: Date
): number {
  return (
    data.getUTCDay() + 6
  ) % 7;
}

/**
 * Por enquanto temos apenas contexto estrutural
 * que já existe no projeto.
 *
 * Feriados, férias escolares, eventos, época do ano
 * e previsão de movimento serão adicionados quando
 * o cadastro inicial do restaurante passar a fornecer
 * esses dados.
 */
function contextoDoDia(
  dia: number
): {
  fimDeSemana: boolean;
  sextaOuMaisTarde: boolean;
} {
  return {
    fimDeSemana:
      dia === SABADO ||
      dia === DOMINGO,

    sextaOuMaisTarde:
      dia >= SEXTA,
  };
}

/**
 * ==========================================================
 * RESTAURANTE
 * ==========================================================
 */

function horarioDoTurno(
  funcionario: PerfilFuncionario,
  dia: number,
  periodo: Periodo,
  horariosPorDia: Map<
    number,
    HorarioDia
  >
) {
  const horario =
    horariosPorDia.get(dia);

  /**
   * NÃO inventamos horário.
   */
  if (
    !horario ||
    horario.fechado
  ) {
    return null;
  }

  const abertura =
    paraMinutos(
      horario.abertura
    );

  const fechamento =
    paraMinutos(
      horario.fechamento
    );

  const inicios =
    inicioDosPeriodos(
      horario.abertura,
      horario.fechamento
    );

  const inicioPeriodo =
    inicios[periodo];

  const horasMaximas =
    Math.max(
      0,
      (
        fechamento -
        abertura -
        funcionario.pausaAlmocoMinutos
      ) / 60
    );

  if (
    horasMaximas <= 0
  ) {
    return null;
  }

  return {
    abertura,

    fechamento,

    inicioPeriodo,

    horasMaximas,
  };
}

/**
 * ==========================================================
 * MEMÓRIA DOS TURNOS
 * ==========================================================
 */

function adicionarTurnoNaMemoria(
  mapa: Map<
    string,
    TurnoMemoria[]
  >,
  turno: TurnoMemoria
) {
  const lista =
    mapa.get(
      turno.funcionario_id
    ) ?? [];

  lista.push(turno);

  mapa.set(
    turno.funcionario_id,
    lista
  );
}

/**
 * Procura o último turno do funcionário
 * no dia indicado.
 */
function turnoDoDia(
  memoria: Map<
    string,
    TurnoMemoria[]
  >,
  funcionarioId: string,
  dia: number
): TurnoMemoria | null {
  const turnos =
    memoria.get(
      funcionarioId
    ) ?? [];

  const doDia =
    turnos.filter(
      (turno) =>
        turno.dia_semana ===
        dia
    );

  if (
    doDia.length === 0
  ) {
    return null;
  }

  return (
    doDia.sort(
      (a, b) =>
        paraMinutos(
          b.hora_fim
        ) -
        paraMinutos(
          a.hora_fim
        )
    )[0] ?? null
  );
}

/**
 ==========================================================
 * DESCANSO
 * ==========================================================
 */

function descansoEntreTurnos(
  turnoAnterior: TurnoMemoria,
  turnoAtual: {
    dia: number;
    horaInicio: number;
  }
): number {
  const fimAnterior =
    paraMinutos(
      turnoAnterior.hora_fim
    );

  /**
   * Se o turno anterior pertence ao dia imediatamente
   * anterior, adicionamos 24h.
   */
  const mesmoDiaOuSeguinte =
    turnoAnterior.dia_semana ===
    turnoAtual.dia;

  if (
    mesmoDiaOuSeguinte
  ) {
    return (
      turnoAtual.horaInicio -
      fimAnterior
    );
  }

  return (
    (
      turnoAtual.dia -
      turnoAnterior.dia_semana
    ) *
      24 *
      60 +
    turnoAtual.horaInicio -
    fimAnterior
  );
}

/**
 Verifica o descanso entre o último turno e
 o novo turno.
 */
function respeitaDescanso(
  memoria: Map<
    string,
    TurnoMemoria[]
  >,
  funcionarioId: string,
  dia: number,
  horaInicio: number
): boolean {
  /**
   * Primeiro verificamos o dia anterior.
   */
  const diaAnterior =
    dia === SEGUNDA
      ? DOMINGO
      : dia - 1;

  const anterior =
    turnoDoDia(
      memoria,
      funcionarioId,
      diaAnterior
    );

  if (!anterior) {
    return true;
  }

  const descanso =
    descansoEntreTurnos(
      anterior,
      {
        dia,
        horaInicio,
      }
    );

  return (
    descanso >=
    DESCANSO_MINIMO_MINUTOS
  );
}

/**
 ==========================================================
 * HORAS DO TURNO
 ==========================================================
 */

function calcularHorasDoTurno(
  funcionario: PerfilFuncionario,
  dia: number,
  periodo: Periodo,
  horasRestantes: Map<
    string,
    number
  >,
  diasTrabalhados: Map<
    string,
    Set<number>
  >,
  horariosPorDia: Map<
    number,
    HorarioDia
  >
) {
  const horario =
    horarioDoTurno(
      funcionario,
      dia,
      periodo,
      horariosPorDia
    );

  if (!horario) {
    return null;
  }

  const restantes =
    horasRestantes.get(
      funcionario.id
    ) ?? 0;

  if (
    restantes <= 0.01
  ) {
    return null;
  }

  const trabalhados =
    diasTrabalhados.get(
      funcionario.id
    )?.size ?? 0;

  const diasRestantes =
    Math.max(
      1,
      funcionario.diasTrabalhoAlvo -
        trabalhados
    );

  /**
   * Distribuímos as horas restantes pelos
   * dias que ainda faltam.
   *
   * Exemplo:
   *
   * 40h / 5 dias = 8h
   * 35h / 5 dias = 7h
   * 20h / 5 dias = 4h
   */
  const horasDesejadas =
    restantes /
    diasRestantes;

  const horas =
    Math.min(
      restantes,
      horasDesejadas,
      horario.horasMaximas
    );

  if (
    horas <= 0.01
  ) {
    return null;
  }

  const duracaoBrutaMinutos =
    horas * 60 +
    funcionario.pausaAlmocoMinutos;

  const ultimoInicioPossivel =
    horario.fechamento -
    duracaoBrutaMinutos;

  const inicio =
    Math.max(
      horario.abertura,
      Math.min(
        horario.inicioPeriodo,
        ultimoInicioPossivel
      )
    );

  const fim =
    inicio +
    duracaoBrutaMinutos;

  if (
    fim >
    horario.fechamento +
      0.01
  ) {
    return null;
  }

  return {
    horas,

    inicio,

    fim,

    abertura:
      horario.abertura,

    fechamento:
      horario.fechamento,
  };
}

/**
 ==========================================================
 * CLASSIFICAÇÃO DO PERÍODO
 ==========================================================
 */

function periodoEhFechamento(
  periodo: Periodo
): boolean {
  return (
    periodo ===
      "Fechamento" ||
    periodo === "Noite"
  );
}

/**
 ==========================================================
 * CONTAGEM / ESTABILIDADE
 ==========================================================
 */

function contarFechamentos(
  memoria: Map<
    string,
    TurnoMemoria[]
  >,
  funcionarioId: string
): number {
  return (
    memoria
      .get(funcionarioId)
      ?.filter(
        (turno) =>
          periodoEhFechamento(
            turno.periodo
          )
      ).length ?? 0
  );
}

function contarFinsDeSemana(
  memoria: Map<
    string,
    TurnoMemoria[]
  >,
  funcionarioId: string
): number {
  return (
    memoria
      .get(funcionarioId)
      ?.filter(
        (turno) =>
          turno.dia_semana ===
            SABADO ||
          turno.dia_semana ===
            DOMINGO
      ).length ?? 0
  );
}

function contarSequenciaAnterior(
  dias: Set<number>,
  dia: number
): number {
  let contador = 0;

  for (
    let atual = dia - 1;
    atual >= 0;
    atual--
  ) {
    if (
      !dias.has(atual)
    ) {
      break;
    }

    contador++;
  }

  return contador;
}

function mesmoPeriodoOuVizinho(
  anterior: Periodo,
  atual: Periodo
): boolean {
  const indiceAnterior =
    PERIODOS_TURNO.indexOf(
      anterior
    );

  const indiceAtual =
    PERIODOS_TURNO.indexOf(
      atual
    );

  if (
    indiceAnterior < 0 ||
    indiceAtual < 0
  ) {
    return false;
  }

  return (
    Math.abs(
      indiceAnterior -
        indiceAtual
    ) <= 1
  );
}

/**
 ==========================================================
 * GERAÇÃO
 ==========================================================
 */

export async function gerarEscalaAutomatica(
  escalaId: string,
  modoAltaDemanda = false,
  substituirTurnosExistentes = false,
  forcarSemanaSeguinte = false
): Promise<GerarEscalaState> {
  const gerente =
    await requireGerente();

  const supabase =
    await createClient();

  /**
   * ========================================================
   * RESTAURANTE + ESCALA
   * ========================================================
   */

  const [
    {
      data: restaurante,
      error: erroRestaurante,
    },
    {
      data: escalaInicial,
      error: erroEscala,
    },
  ] = await Promise.all([
    supabase
      .from("restaurantes")
      .select(
        "usa_zonas, permite_ia, dias_funcionamento, cobertura_fds_prioritaria"
      )
      .eq(
        "id",
        gerente.restauranteId
      )
      .single(),

    supabase
      .from("escalas")
      .select(
        "id, semana_inicio, semana_fim, status"
      )
      .eq(
        "id",
        escalaId
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      )
      .maybeSingle(),
  ]);

  if (erroRestaurante) {
    return {
      erro: `Falha ao consultar o restaurante: ${erroRestaurante.message}`,
    };
  }

  if (erroEscala) {
    return {
      erro: `Falha ao consultar a escala: ${erroEscala.message}`,
    };
  }

  if (!escalaInicial) {
    return {
      erro:
        "Escala não encontrada para este restaurante.",
    };
  }

  /**
   * Mantemos a lógica atual de planos.
   *
   * Futuramente:
   *
   * Trial
   * Médio
   * Pro
   *
   * poderão controlar esta permissão.
   */
  if (
    restaurante &&
    !restaurante.permite_ia
  ) {
    return {
      erro:
        "Seu plano atual não inclui a geração automática de escala. Faça upgrade pra liberar.",
    };
  }

  /**
   * ========================================================
   * PROTEÇÃO DA SEMANA ATUAL
   * ========================================================
   */

  const semanaAtualInicio =
    toISODate(
      getInicioSemana(
        new Date()
      )
    );

  const hoje =
    new Date();

  const hojeDia =
    diaSistemaDaData(
      hoje
    );

  const eFimDeSemana =
    hojeDia === SABADO ||
    hojeDia === DOMINGO;

  const eSemanaAtual =
    escalaInicial.semana_inicio ===
    semanaAtualInicio;

  if (
    eSemanaAtual &&
    eFimDeSemana &&
    !forcarSemanaSeguinte
  ) {
    return {
      erro:
        "Não é possível gerar a escala pois está em cima da hora, gostaria de gerar a escala da semana seguinte?",

      confirmarSemanaSeguinte:
        true,

      requerSemanaSeguinte:
        true,
    };
  }

  /**
   * ========================================================
   * SEMANA SEGUINTE
   * ========================================================
   */

  let escala =
    escalaInicial;

  if (
    forcarSemanaSeguinte
  ) {
    const inicioSeguinte =
      new Date(
        `${escalaInicial.semana_inicio}T00:00:00Z`
      );

    inicioSeguinte.setUTCDate(
      inicioSeguinte.getUTCDate() +
        7
    );

    const fimSeguinte =
      new Date(
        inicioSeguinte
      );

    fimSeguinte.setUTCDate(
      fimSeguinte.getUTCDate() +
        6
    );

    const semanaInicioSeguinte =
      toISODate(
        inicioSeguinte
      );

    const {
      data:
        escalaSeguinteExistente,
      error:
        erroBuscaSeguinte,
    } = await supabase
      .from("escalas")
      .select(
        "id, semana_inicio, semana_fim, status"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      )
      .eq(
        "semana_inicio",
        semanaInicioSeguinte
      )
      .maybeSingle();

    if (
      erroBuscaSeguinte
    ) {
      return {
        erro: `Falha ao consultar a semana seguinte: ${erroBuscaSeguinte.message}`,
      };
    }

    if (
      escalaSeguinteExistente
    ) {
      escala =
        escalaSeguinteExistente;
    } else {
      const {
        data: novaEscala,
        error:
          erroCriacao,
      } = await supabase
        .from("escalas")
        .insert({
          restaurante_id:
            gerente.restauranteId,

          semana_inicio:
            semanaInicioSeguinte,

          semana_fim:
            toISODate(
              fimSeguinte
            ),

          status:
            "rascunho",
        })
        .select(
          "id, semana_inicio, semana_fim, status"
        )
        .single();

      if (
        erroCriacao ||
        !novaEscala
      ) {
        return {
          erro: `Falha ao criar a escala da semana seguinte: ${erroCriacao?.message ?? "erro desconhecido"}`,
        };
      }

      escala =
        novaEscala;
    }

    escalaId =
      escala.id;

    /**
     * A semana seguinte não deve apagar uma escala
     * já existente automaticamente.
     */
    substituirTurnosExistentes =
      false;
  }

  /**
   * ========================================================
   * TURNOS EXISTENTES
   * ========================================================
   */

  const {
    data:
      turnosExistentes,
    error:
      erroTurnosExistentes,
  } = await supabase
    .from("turnos")
    .select(
      "id, funcionario_id, zona_id, dia_semana, periodo, hora_inicio, hora_fim"
    )
    .eq(
      "escala_id",
      escala.id
    )
    .eq(
      "restaurante_id",
      gerente.restauranteId
    );

  if (
    erroTurnosExistentes
  ) {
    return {
      erro: `Falha ao consultar a escala: ${erroTurnosExistentes.message}`,
    };
  }

  const quantidadeTurnosExistentes =
    turnosExistentes?.length ??
    0;

  const turnosSubstituidos =
    substituirTurnosExistentes
      ? quantidadeTurnosExistentes
      : 0;

  /**
   * Mantemos o comportamento atual:
   * quando "Gerar novamente" é utilizado,
   * a escala atual é limpa antes da nova geração.
   */
  if (
    substituirTurnosExistentes &&
    quantidadeTurnosExistentes >
      0
  ) {
    const {
      error,
    } = await supabase
      .from("turnos")
      .delete()
      .eq(
        "escala_id",
        escala.id
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      );

    if (error) {
      return {
        erro: `Falha ao limpar os turnos existentes: ${error.message}`,
      };
    }
  }

  /**
   * ========================================================
   * DADOS PRINCIPAIS
   * ========================================================
   */

  const [
    {
      data: zonasRaw,
      error: erroZonas,
    },
    {
      data: funcionariosRaw,
      error:
        erroFuncionarios,
    },
    {
      data:
        disponibilidadesRaw,
      error:
        erroDisponibilidades,
    },
    {
      data: horariosRaw,
      error:
        erroHorarios,
    },
  ] = await Promise.all([
    supabase
      .from("zonas")
      .select(
        "id, capacidade_minima"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      )
      .eq(
        "ativo",
        true
      ),

    supabase
      .from("funcionarios")
      .select(
        "id, zona_id, carga_horaria_semanal_max, folgas_obrigatorias_semana, pausa_almoco_minutos"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      )
      .eq(
        "ativo",
        true
      ),

    supabase
      .from("disponibilidades")
      .select(
        "funcionario_id, dia_semana, disponivel, periodo"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      ),

    supabase
      .from("horarios_funcionamento")
      .select(
        "dia_semana, fechado, hora_abertura, hora_fechamento"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      ),
  ]);

  if (erroZonas) {
    return {
      erro: `Falha ao consultar zonas: ${erroZonas.message}`,
    };
  }

  if (
    erroFuncionarios
  ) {
    return {
      erro: `Falha ao consultar funcionários: ${erroFuncionarios.message}`,
    };
  }

  if (
    erroDisponibilidades
  ) {
    return {
      erro: `Falha ao consultar disponibilidades: ${erroDisponibilidades.message}`,
    };
  }

  if (erroHorarios) {
    return {
      erro: `Falha ao consultar horários do restaurante: ${erroHorarios.message}`,
    };
  }

  /**
   * ========================================================
   * CONFIGURAÇÃO
   * ========================================================
   */

  const usaZonas =
    restaurante?.usa_zonas ??
    false;

  const diasFuncionamento: number[] =
    restaurante?.dias_funcionamento ??
    [0, 1, 2, 3, 4, 5, 6];

  const zonas =
    zonasRaw ?? [];

  const disponibilidades =
    disponibilidadesRaw ?? [];

  const horariosPorDia =
    new Map<
      number,
      HorarioDia
    >();

  for (
    const horario of
      horariosRaw ?? []
  ) {
    if (
      !horario.hora_abertura ||
      !horario.hora_fechamento
    ) {
      continue;
    }

    horariosPorDia.set(
      horario.dia_semana,
      {
        fechado:
          Boolean(
            horario.fechado
          ),

        abertura:
          horario.hora_abertura.slice(
            0,
            5
          ),

        fechamento:
          horario.hora_fechamento.slice(
            0,
            5
          ),
      }
    );
  }

  /**
   * Se o restaurante diz que funciona num dia,
   * precisamos ter o horário desse dia configurado.
   *
   * Não inventamos 09:00 / 23:00.
   */
  const diasSemHorario =
    diasFuncionamento.filter(
      (dia) =>
        !horariosPorDia.has(
          dia
        )
    );

  if (
    diasSemHorario.length >
    0
  ) {
    return {
      erro:
        `Existem dias de funcionamento sem horário configurado: ${diasSemHorario
          .map(
            (dia) =>
              [
                "segunda",
                "terça",
                "quarta",
                "quinta",
                "sexta",
                "sábado",
                "domingo",
              ][dia]
          )
          .join(", ")}.`,
    };
  }

  /**
   * ========================================================
   * FUNCIONÁRIOS
   * ========================================================
   */

  const funcionarios: PerfilFuncionario[] =
    (
      funcionariosRaw ??
      []
    ).map(
      (funcionario) => ({
        id:
          funcionario.id,

        zonaId:
          funcionario.zona_id,

        cargaHorariaSemanalMax:
          Number(
            funcionario.carga_horaria_semanal_max
          ),

        pausaAlmocoMinutos:
          funcionario.pausa_almoco_minutos ??
          30,

        diasTrabalhoAlvo:
          Math.max(
            0,
            Math.min(
              diasFuncionamento.length,
              7 -
                Number(
                  funcionario.folgas_obrigatorias_semana ??
                    0
                )
            )
          ),
      })
    );

  /**
   * ========================================================
   * DATAS DA SEMANA
   * ========================================================
   */

  const semanaInicio =
    new Date(
      `${escala.semana_inicio}T00:00:00Z`
    );

  const hojeISO =
    paraISODateUTC(
      new Date()
    );

  const dataDoDia =
    (dia: number) => {
      const data =
        new Date(
          semanaInicio
        );

      data.setUTCDate(
        data.getUTCDate() +
          dia
      );

      return paraISODateUTC(
        data
      );
    };

  const diasPassados =
    new Set(
      Array.from(
        { length: 7 },
        (_, dia) => dia
      ).filter(
        (dia) =>
          dataDoDia(dia) <
          hojeISO
      )
    );

  /**
   * ========================================================
   * DIAS QUE PODEM SER GERADOS
   * ========================================================
   */

  const diasParaProcessar =
    diasFuncionamento.filter(
      (dia) =>
        !diasPassados.has(
          dia
        ) &&
        !(
          horariosPorDia.get(
            dia
          )?.fechado ??
          false
        )
    );

  if (
    diasParaProcessar.length ===
    0
  ) {
    return {
      erro:
        "Não existem dias abertos e disponíveis para gerar nesta semana.",
    };
  }

  /**
   * ========================================================
   * MEMÓRIA DA ESCALA
   * ========================================================
   */

  const turnosBase =
    substituirTurnosExistentes
      ? []
      : turnosExistentes ??
        [];

  const memoriaTurnos =
    new Map<
      string,
      TurnoMemoria[]
    >();

  const diasTrabalhados =
    new Map<
      string,
      Set<number>
    >();

  const horasRestantes =
    new Map<
      string,
      number
    >();

  for (
    const funcionario of
      funcionarios
  ) {
    diasTrabalhados.set(
      funcionario.id,
      new Set<number>()
    );

    horasRestantes.set(
      funcionario.id,
      funcionario.cargaHorariaSemanalMax
    );
  }

  /**
   * Turnos da própria semana.
   */
  for (
    const turno of
      turnosBase
  ) {
    const memoria: TurnoMemoria =
      {
        funcionario_id:
          turno.funcionario_id,

        dia_semana:
          turno.dia_semana,

        periodo:
          turno.periodo as Periodo,

        hora_inicio:
          turno.hora_inicio?.slice(
            0,
            5
          ) ?? "00:00",

        hora_fim:
          turno.hora_fim?.slice(
            0,
            5
          ) ?? "00:00",

        zona_id:
          turno.zona_id,
      };

    adicionarTurnoNaMemoria(
      memoriaTurnos,
      memoria
    );

    diasTrabalhados
      .get(
        turno.funcionario_id
      )
      ?.add(
        turno.dia_semana
      );

    const funcionario =
      funcionarios.find(
        (item) =>
          item.id ===
          turno.funcionario_id
      );

    if (
      funcionario
    ) {
      const horas =
        horasEfetivasDoTurno(
          memoria.hora_inicio,
          memoria.hora_fim,
          funcionario.pausaAlmocoMinutos
        );

      horasRestantes.set(
        funcionario.id,
        Math.max(
          0,
          (
            horasRestantes.get(
              funcionario.id
            ) ?? 0
          ) - horas
        )
      );
    }
  }

  /**
   * ========================================================
   * SEMANA ANTERIOR
   * ========================================================
   *
   * Isto é importante para evitar:
   *
   * Domingo 23:00
   * +
   * Segunda 09:00
   *
   * mesmo que o turno de domingo pertença
   * à escala anterior.
   */

  const inicioSemanaAnterior =
    new Date(
      semanaInicio
    );

  inicioSemanaAnterior.setUTCDate(
    inicioSemanaAnterior.getUTCDate() -
      7
  );

  const semanaAnteriorISO =
    toISODate(
      inicioSemanaAnterior
    );

  const {
    data:
      escalaAnterior,
  } = await supabase
    .from("escalas")
    .select("id")
    .eq(
      "restaurante_id",
      gerente.restauranteId
    )
    .eq(
      "semana_inicio",
      semanaAnteriorISO
    )
    .maybeSingle();

  if (
    escalaAnterior
  ) {
    const {
      data:
        turnosSemanaAnterior,
    } = await supabase
      .from("turnos")
      .select(
        "funcionario_id, zona_id, dia_semana, periodo, hora_inicio, hora_fim"
      )
      .eq(
        "escala_id",
        escalaAnterior.id
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      );

    for (
      const turno of
        turnosSemanaAnterior ??
        []
    ) {
      adicionarTurnoNaMemoria(
        memoriaTurnos,
        {
          funcionario_id:
            turno.funcionario_id,

          dia_semana:
            turno.dia_semana,

          periodo:
            turno.periodo as Periodo,

          hora_inicio:
            turno.hora_inicio?.slice(
              0,
              5
            ) ?? "00:00",

          hora_fim:
            turno.hora_fim?.slice(
              0,
              5
            ) ?? "00:00",

          zona_id:
            turno.zona_id,
        }
      );
    }
  }

  /**
   * ========================================================
   * COBERTURA
   * ========================================================
   */

  const cobertura =
    new Map<
      string,
      number
    >();

  function chaveCobertura(
    zonaId: string | null,
    dia: number,
    periodo: Periodo
  ) {
    return `${
      zonaId ??
      "sem-zona"
    }:${dia}:${periodo}`;
  }

  for (
    const turno of
      turnosBase
  ) {
    const chave =
      chaveCobertura(
        turno.zona_id,
        turno.dia_semana,
        turno.periodo as Periodo
      );

    cobertura.set(
      chave,
      (
        cobertura.get(
          chave
        ) ?? 0
      ) + 1
    );
  }

  /**
   * ========================================================
   * NECESSIDADES
   * ========================================================
   */

  const zonasDaEscala:
    (
      | {
          id: string;
          capacidade_minima: number;
        }
      | null
    )[] =
    usaZonas
      ? zonas
      : [null];

  if (
    usaZonas &&
    zonasDaEscala.length ===
      0
  ) {
    return {
      erro:
        "O restaurante está configurado para usar zonas, mas não existem zonas ativas.",
    };
  }

  const capacidadeParaZona =
    (
      zonaId: string | null
    ) => {
      const zona =
        zonas.find(
          (item) =>
            item.id ===
            zonaId
        );

      const base =
        zona
          ? Math.max(
              Number(
                zona.capacidade_minima
              ) || 1,
              1
            )
          : 1;

      return modoAltaDemanda
        ? Math.ceil(
            base *
              MULTIPLICADOR_COBERTURA_EVENTO
          )
        : base;
    };

  const slots: SlotNecessidade[] =
    [];

  for (
    const dia of
      diasParaProcessar
  ) {
    for (
      const zona of
        zonasDaEscala
    ) {
      const zonaId =
        zona?.id ??
        null;

      const capacidade =
        capacidadeParaZona(
          zonaId
        );

      for (
        const periodo of
          PERIODOS_TURNO
      ) {
        const preenchido =
          cobertura.get(
            chaveCobertura(
              zonaId,
              dia,
              periodo
            )
          ) ?? 0;

        slots.push({
          zonaId,

          dia,

          periodo,

          capacidade,

          preenchido,
        });
      }
    }
  }

  /**
   * ========================================================
   * FUNÇÃO DE CANDIDATO
   * ========================================================
   */

  const podeSerCandidato =
    (
      funcionario: PerfilFuncionario,
      dia: number,
      periodo: Periodo
    ) => {
      if (
        usaZonas &&
        !funcionario.zonaId
      ) {
        return false;
      }

      if (
        usaZonas &&
        funcionario.zonaId ===
          null
      ) {
        return false;
      }

      if (
        indisponivelNoDia(
          disponibilidades,
          funcionario.id,
          dia
        )
      ) {
        return false;
      }

      if (
        periodoIndisponivel(
          disponibilidades,
          funcionario.id,
          dia,
          periodo
        )
      ) {
        return false;
      }

      if (
        diasTrabalhados
          .get(
            funcionario.id
          )
          ?.has(dia)
      ) {
        return false;
      }

      if (
        (
          horasRestantes.get(
            funcionario.id
          ) ?? 0
        ) <= 0.01
      ) {
        return false;
      }

      if (
        funcionario.diasTrabalhoAlvo <=
        (
          diasTrabalhados.get(
            funcionario.id
          )?.size ?? 0
        )
      ) {
        return false;
      }

      const calculo =
        calcularHorasDoTurno(
          funcionario,
          dia,
          periodo,
          horasRestantes,
          diasTrabalhados,
          horariosPorDia
        );

      if (!calculo) {
        return false;
      }

      if (
        !respeitaDescanso(
          memoriaTurnos,
          funcionario.id,
          dia,
          calculo.inicio
        )
      ) {
        return false;
      }

      return true;
    };

  /**
   * ========================================================
   * SCORE DO CANDIDATO
   * ========================================================
   *
   * Aqui começa a "inteligência" do motor.
   *
   * Não é uma IA generativa.
   *
   * É um sistema de decisão ponderada.
   *
   * Mais tarde podemos acrescentar dados do restaurante
   * e transformar estes pesos em algo ainda mais sofisticado.
   */

  const scoreFuncionario =
    (
      funcionario: PerfilFuncionario,
      dia: number,
      periodo: Periodo,
      zonaId: string | null
    ): number => {
      let score = 0;

      const preferencias =
        periodosPreferidos(
          disponibilidades,
          funcionario.id,
          dia
        );

      const total =
        possuiDisponibilidadeTotal(
          disponibilidades,
          funcionario.id,
          dia
        );

      /**
       * ------------------------------------------------------
       * PREFERÊNCIA DE PERÍODO
       * ------------------------------------------------------
       */

      if (
        preferencias.includes(
          periodo
        )
      ) {
        /**
         * Preferência específica recebe prioridade.
         */
        score += 55;
      } else if (
        total
      ) {
        /**
         * Total é flexível, mas NÃO recebe a mesma
         * prioridade que uma preferência específica.
         */
        score += 15;
      } else if (
        preferencias.length ===
        0
      ) {
        /**
         * Sem preferência explícita.
         */
        score += 5;
      } else {
        /**
         * Existe preferência específica, mas estamos
         * usando o funcionário fora dela.
         */
        score -= 12;
      }

      /**
       * ------------------------------------------------------
       * HORAS SEMANAIS
       * ------------------------------------------------------
       *
       * Favorecemos quem está mais longe de completar
       * a própria carga horária.
       */

      const maxHoras =
        Math.max(
          funcionario.cargaHorariaSemanalMax,
          0.01
        );

      const horasRestantesFuncionario =
        Math.max(
          0,
          horasRestantes.get(
            funcionario.id
          ) ?? 0
        );

      const percentualRestante =
        Math.min(
          1,
          horasRestantesFuncionario /
            maxHoras
        );

      score +=
        percentualRestante *
        30;

      /**
       * ------------------------------------------------------
       * DIAS DE TRABALHO
       * ------------------------------------------------------
       */

      const diasFeitos =
        diasTrabalhados.get(
          funcionario.id
        )?.size ?? 0;

      const diasRestantes =
        Math.max(
          0,
          funcionario.diasTrabalhoAlvo -
            diasFeitos
        );

      score +=
        Math.min(
          25,
          diasRestantes * 5
        );

      /**
       * ------------------------------------------------------
       * FINS DE SEMANA
       * ------------------------------------------------------
       */

      const contexto =
        contextoDoDia(
          dia
        );

      const finsDeSemana =
        contarFinsDeSemana(
          memoriaTurnos,
          funcionario.id
        );

      if (
        contexto.fimDeSemana
      ) {
        if (
          restaurante
            ?.cobertura_fds_prioritaria
        ) {
          score += 10;
        }

        /**
         * Se já trabalhou muitos fins de semana,
         * tentamos distribuir melhor.
         */
        score -=
          finsDeSemana *
          8;
      }

      /**
       * ------------------------------------------------------
       * FECHAMENTOS
       * ------------------------------------------------------
       */

      const fechamentos =
        contarFechamentos(
          memoriaTurnos,
          funcionario.id
        );

      if (
        periodoEhFechamento(
          periodo
        )
      ) {
        /**
         * Quanto mais fechamentos já possui,
         * menor a prioridade.
         */
        score -=
          fechamentos *
          12;
      } else {
        /**
         * Quem tem muitos fechamentos recebe
         * uma pequena compensação para outros períodos.
         */
        score +=
          Math.min(
            fechamentos * 2,
            8
          );
      }

      /**
       * ------------------------------------------------------
       * ESTABILIDADE DE HORÁRIO
       * ------------------------------------------------------
       */

      const diaAnterior =
        dia === SEGUNDA
          ? DOMINGO
          : dia - 1;

      const turnoAnterior =
        turnoDoDia(
          memoriaTurnos,
          funcionario.id,
          diaAnterior
        );

      if (
        turnoAnterior
      ) {
        if (
          turnoAnterior.periodo ===
          periodo
        ) {
          score += 12;
        } else if (
          mesmoPeriodoOuVizinho(
            turnoAnterior.periodo,
            periodo
          )
        ) {
          score += 4;
        } else {
          score -= 8;
        }
      }

      /**
       * ------------------------------------------------------
       * SEQUÊNCIA DE DIAS
       * ------------------------------------------------------
       */

      const sequencia =
        contarSequenciaAnterior(
          diasTrabalhados.get(
            funcionario.id
          ) ??
            new Set<number>(),
          dia
        );

      /**
       * Trabalhar 4/5 dias seguidos pode ser perfeitamente
       * normal.
       *
       * A partir daí começamos a penalizar.
       */
      if (
        sequencia >= 5
      ) {
        score -=
          (sequencia - 4) *
          10;
      }

      /**
       * ------------------------------------------------------
       * DESCANSO
       * ------------------------------------------------------
       */

      const calculo =
        calcularHorasDoTurno(
          funcionario,
          dia,
          periodo,
          horasRestantes,
          diasTrabalhados,
          horariosPorDia
        );

      if (
        calculo
      ) {
        const anterior =
          turnoDoDia(
            memoriaTurnos,
            funcionario.id,
            diaAnterior
          );

        if (
          anterior
        ) {
          const descanso =
            descansoEntreTurnos(
              anterior,
              {
                dia,
                horaInicio:
                  calculo.inicio,
              }
            );

          if (
            descanso <
            DESCANSO_IDEAL_MINUTOS
          ) {
            score -= 18;
          }
        }
      }

      /**
       * ------------------------------------------------------
       * NECESSIDADE DO DIA
       * ------------------------------------------------------
       *
       * Se o dia ainda não possui ninguém naquela zona,
       * damos prioridade para não deixar um restaurante
       * aberto sem qualquer colaborador.
       */

      const trabalhadoresNoDia =
        Array.from(
          memoriaTurnos.values()
        ).filter(
          (lista) =>
            lista.some(
              (turno) =>
                turno.dia_semana ===
                  dia &&
                (
                  !usaZonas ||
                  turno.zona_id ===
                    zonaId
                )
            )
        ).length;

      if (
        trabalhadoresNoDia ===
        0
      ) {
        score += 45;
      }

      /**
       * ------------------------------------------------------
       * PEQUENO PESO PARA EVITAR SEMPRE OS MESMOS
       * ------------------------------------------------------
       */

      score +=
        funcionario.id
          .split("")
          .reduce(
            (
              total,
              caractere
            ) =>
              total +
              caractere.charCodeAt(
                0
              ),
            0
          ) %
          10 *
          0.01;

      return score;
    };

  /**
   * ========================================================
   * ALOCAÇÃO
   * ========================================================
   */

  const novosTurnos: TurnoNovo[] =
    [];

  const alocar =
    (
      funcionario: PerfilFuncionario,
      zonaId: string | null,
      dia: number,
      periodo: Periodo
    ): boolean => {
      const calculo =
        calcularHorasDoTurno(
          funcionario,
          dia,
          periodo,
          horasRestantes,
          diasTrabalhados,
          horariosPorDia
        );

      if (!calculo) {
        return false;
      }

      /**
       * Última verificação de segurança.
       */
      if (
        !respeitaDescanso(
          memoriaTurnos,
          funcionario.id,
          dia,
          calculo.inicio
        )
      ) {
        return false;
      }

      const preferencias =
        periodosPreferidos(
          disponibilidades,
          funcionario.id,
          dia
        );

      const total =
        possuiDisponibilidadeTotal(
          disponibilidades,
          funcionario.id,
          dia
        );

      const foraPreferencia =
        !total &&
        preferencias.length >
          0 &&
        !preferencias.includes(
          periodo
        );

      const turno: TurnoNovo =
        {
          restaurante_id:
            gerente.restauranteId,

          escala_id:
            escalaId,

          funcionario_id:
            funcionario.id,

          zona_id:
            zonaId,

          dia_semana:
            dia,

          periodo,

          hora_inicio:
            paraHora(
              calculo.inicio
            ),

          hora_fim:
            paraHora(
              calculo.fim
            ),

          fora_preferencia:
            foraPreferencia,

          status:
            "agendado",
        };

      novosTurnos.push(
        turno
      );

      const memoria:
        TurnoMemoria =
        {
          funcionario_id:
            funcionario.id,

          dia_semana:
            dia,

          periodo,

          hora_inicio:
            turno.hora_inicio,

          hora_fim:
            turno.hora_fim,

          zona_id:
            zonaId,
        };

      adicionarTurnoNaMemoria(
        memoriaTurnos,
        memoria
      );

      diasTrabalhados
        .get(
          funcionario.id
        )
        ?.add(dia);

      horasRestantes.set(
        funcionario.id,
        Math.max(
          0,
          (
            horasRestantes.get(
              funcionario.id
            ) ?? 0
          ) -
            calculo.horas
        )
      );

      const chave =
        chaveCobertura(
          zonaId,
          dia,
          periodo
        );

      cobertura.set(
        chave,
        (
          cobertura.get(
            chave
          ) ?? 0
        ) + 1
      );

      return true;
    };

  /**
   * ========================================================
   * FASE 1
   *
   * GARANTIR QUE CADA DIA ABERTO TENHA PELO MENOS
   * UMA PESSOA POR ZONA.
   *
   * Esta é a correção principal do problema que vimos
   * na terça-feira.
   * ========================================================
   */

  for (
    const dia of
      diasParaProcessar
  ) {
    for (
      const zona of
        zonasDaEscala
    ) {
      const zonaId =
        zona?.id ??
        null;

      const existePessoa =
        Array.from(
          memoriaTurnos.values()
        ).some(
          (lista) =>
            lista.some(
              (turno) =>
                turno.dia_semana ===
                  dia &&
                (
                  !usaZonas ||
                  turno.zona_id ===
                    zonaId
                )
            )
        );

      if (
        existePessoa
      ) {
        continue;
      }

      let melhor:
        {
          funcionario: PerfilFuncionario;
          periodo: Periodo;
          score: number;
        } | null =
        null;

      for (
        const funcionario of
          funcionarios
      ) {
        for (
          const periodo of
            PERIODOS_TURNO
        ) {
          if (
            !podeSerCandidato(
              funcionario,
              dia,
              periodo
            )
          ) {
            continue;
          }

          const score =
            scoreFuncionario(
              funcionario,
              dia,
              periodo,
              zonaId
            );

          if (
            !melhor ||
            score >
              melhor.score
          ) {
            melhor = {
              funcionario,
              periodo,
              score,
            };
          }
        }
      }

      if (
        melhor
      ) {
        alocar(
          melhor.funcionario,
          zonaId,
          dia,
          melhor.periodo
        );
      }
    }
  }

  /**
   * ========================================================
   * FASE 2
   *
   * COMPLETAR A COBERTURA.
   *
   * Agora que todos os dias possíveis já receberam
   * cobertura mínima, tentamos preencher cada período.
   * ========================================================
   */

  let houveProgresso =
    true;

  while (
    houveProgresso
  ) {
    houveProgresso =
      false;

    /**
     * Apenas necessidades ainda abertas.
     */
    const pendentes =
      slots.filter(
        (slot) =>
          slot.preenchido <
          slot.capacidade
      );

    if (
      pendentes.length ===
      0
    ) {
      break;
    }

    /**
     * Para cada vaga, calculamos quantos candidatos
     * realmente podem preenchê-la.
     *
     * Vagas com poucos candidatos recebem prioridade.
     */
    const avaliadas =
      pendentes
        .map(
          (slot) => {
            const candidatos =
              funcionarios.filter(
                (funcionario) =>
                  (
                    !usaZonas ||
                    funcionario.zonaId ===
                      slot.zonaId
                  ) &&
                  podeSerCandidato(
                    funcionario,
                    slot.dia,
                    slot.periodo
                  )
              );

            const trabalhadoresDia =
              Array.from(
                memoriaTurnos.values()
              ).filter(
                (lista) =>
                  lista.some(
                    (turno) =>
                      turno.dia_semana ===
                        slot.dia &&
                      (
                        !usaZonas ||
                        turno.zona_id ===
                          slot.zonaId
                      )
                  )
              ).length;

            const contexto =
              contextoDoDia(
                slot.dia
              );

            let prioridade =
              0;

            /**
             * Necessidade ainda grande.
             */
            prioridade +=
              (
                slot.capacidade -
                slot.preenchido
              ) * 25;

            /**
             * Poucos candidatos =
             * situação mais urgente.
             */
            prioridade +=
              Math.max(
                0,
                12 -
                  candidatos.length
              ) * 12;

            /**
             * Dia sem pessoas ainda.
             */
            if (
              trabalhadoresDia ===
              0
            ) {
              prioridade +=
                80;
            }

            /**
             * Fim de semana prioritário,
             * quando o restaurante configurou isso.
             */
            if (
              contexto.fimDeSemana &&
              restaurante
                ?.cobertura_fds_prioritaria
            ) {
              prioridade +=
                15;
            }

            /**
             * Pequeno peso para processar
             * dias mais cedo quando tudo empata.
             */
            prioridade +=
              (6 -
                slot.dia) *
              0.01;

            return {
              slot,

              candidatos,

              prioridade,
            };
          }
        )
        .filter(
          (item) =>
            item.candidatos
              .length > 0
        )
        .sort(
          (a, b) =>
            b.prioridade -
            a.prioridade
        );

    const atual =
      avaliadas[0];

    if (!atual) {
      break;
    }

    /**
     * Escolhemos o melhor funcionário para esta vaga.
     */
    let melhor:
      {
        funcionario: PerfilFuncionario;
        score: number;
      } | null =
      null;

    for (
      const funcionario of
        atual.candidatos
    ) {
      const score =
        scoreFuncionario(
          funcionario,
          atual.slot.dia,
          atual.slot.periodo,
          atual.slot.zonaId
        );

      if (
        !melhor ||
        score >
          melhor.score
      ) {
        melhor = {
          funcionario,
          score,
        };
      }
    }

    if (
      !melhor
    ) {
      break;
    }

    const sucesso =
      alocar(
        melhor.funcionario,
        atual.slot.zonaId,
        atual.slot.dia,
        atual.slot.periodo
      );

    if (
      !sucesso
    ) {
      /**
       * Evita loop infinito.
       */
      atual.slot.preenchido =
        atual.slot.capacidade;
      continue;
    }

    atual.slot.preenchido++;

    houveProgresso =
      true;
  }

  /**
   * ========================================================
   * FASE 3
   *
   * TENTATIVA DE USAR HORAS AINDA DISPONÍVEIS
   * NOS DIAS JÁ PLANEADOS.
   *
   * Aqui não quebramos cobertura nem criamos
   * dois turnos no mesmo dia.
   * ========================================================
   */

  for (
    const funcionario of
      funcionarios
        .slice()
        .sort(
          (a, b) =>
            (
              horasRestantes.get(
                b.id
              ) ?? 0
            ) -
              (
                horasRestantes.get(
                  a.id
                ) ?? 0
              )
        )
  ) {
    if (
      (
        horasRestantes.get(
          funcionario.id
        ) ?? 0
      ) <= 0.01
    ) {
      continue;
    }

    if (
      (
        diasTrabalhados.get(
          funcionario.id
        )?.size ?? 0
      ) >=
      funcionario.diasTrabalhoAlvo
    ) {
      continue;
    }

    /**
     * Primeiro tentamos dias em que ainda
     * não há cobertura suficiente.
     */
    const diasOrdenados =
      diasParaProcessar
        .filter(
          (dia) =>
            !(
              diasTrabalhados
                .get(
                  funcionario.id
                )
                ?.has(dia) ??
              false
            )
        )
        .sort(
          (a, b) => {
            const scoreA =
              scoreFuncionario(
                funcionario,
                a,
                PERIODOS_TURNO[0],
                usaZonas
                  ? funcionario.zonaId
                  : null
              );

            const scoreB =
              scoreFuncionario(
                funcionario,
                b,
                PERIODOS_TURNO[0],
                usaZonas
                  ? funcionario.zonaId
                  : null
              );

            return (
              scoreB -
              scoreA
            );
          }
        );

    for (
      const dia of
        diasOrdenados
    ) {
      if (
        (
          horasRestantes.get(
            funcionario.id
          ) ?? 0
        ) <= 0.01
      ) {
        break;
      }

      if (
        (
          diasTrabalhados.get(
            funcionario.id
          )?.size ?? 0
        ) >=
        funcionario.diasTrabalhoAlvo
      ) {
        break;
      }

      const zonaId =
        usaZonas
          ? funcionario.zonaId
          : null;

      if (
        usaZonas &&
        !zonaId
      ) {
        continue;
      }

      const preferencias =
        periodosPreferidos(
          disponibilidades,
          funcionario.id,
          dia
        );

      const periodosOrdenados =
        PERIODOS_TURNO
          .slice()
          .sort(
            (a, b) => {
              const prefA =
                preferencias.includes(
                  a
                )
                  ? 1
                  : 0;

              const prefB =
                preferencias.includes(
                  b
                )
                  ? 1
                  : 0;

              if (
                prefA !==
                prefB
              ) {
                return (
                  prefB -
                  prefA
                );
              }

              const coberturaA =
                cobertura.get(
                  chaveCobertura(
                    zonaId,
                    dia,
                    a
                  )
                ) ?? 0;

              const coberturaB =
                cobertura.get(
                  chaveCobertura(
                    zonaId,
                    dia,
                    b
                  )
                ) ?? 0;

              return (
                coberturaA -
                coberturaB
              );
            }
          );

      for (
        const periodo of
          periodosOrdenados
      ) {
        if (
          !podeSerCandidato(
            funcionario,
            dia,
            periodo
          )
        ) {
          continue;
        }

        const sucesso =
          alocar(
            funcionario,
            zonaId,
            dia,
            periodo
          );

        if (
          sucesso
        ) {
          break;
        }
      }
    }
  }

  /**
   * ========================================================
   * RESULTADO / VAGAS NÃO PREENCHIDAS
   * ========================================================
   */

  let vagasSemCandidato =
    0;

  for (
    const slot of
      slots
  ) {
    const preenchido =
      cobertura.get(
        chaveCobertura(
          slot.zonaId,
          slot.dia,
          slot.periodo
        )
      ) ?? 0;

    const faltam =
      Math.max(
        0,
        slot.capacidade -
          preenchido
      );

    vagasSemCandidato +=
      faltam;
  }

  /**
   * ========================================================
   * GRAVAR
   * ========================================================
   */

  if (
    novosTurnos.length >
    0
  ) {
    const {
      error,
    } = await supabase
      .from("turnos")
      .insert(
        novosTurnos
      );

    if (error) {
      return {
        erro: `Falha ao gravar a escala: ${error.message}`,
      };
    }
  }

  /**
   * ========================================================
   * HORAS RESTANTES
   * ========================================================
   */

  const horasNaoAlocadas =
    arredondar(
      Array.from(
        horasRestantes.values()
      ).reduce(
        (
          total,
          horas
        ) =>
          total + horas,
        0
      )
    );

  const funcionariosComMetaIncompleta =
    Array.from(
      horasRestantes.values()
    ).filter(
      (horas) =>
        horas > 0.01
    ).length;

  /**
   * ========================================================
   * REVALIDAÇÃO
   * ========================================================
   */

  revalidatePath(
    "/escalas"
  );

  return {
    turnosGerados:
      novosTurnos.length,

    turnosSubstituidos,

    vagasSemCandidato,

    diasProtegidos:
      diasPassados.size,

    horasNaoAlocadas,

    funcionariosComMetaIncompleta,

    semanaInicioGerada:
      escala.semana_inicio,
  };
}

/**
 * ==========================================================
 * GERAR SEMANA SEGUINTE
 * ==========================================================
 *
 * Mantemos esta função porque a interface GradeSemanal
 * já utiliza esta Server Action.
 */
export async function gerarEscalaSemanaSeguinte(
  escalaId: string,
  modoAltaDemanda = false
): Promise<GerarEscalaState> {
  return gerarEscalaAutomatica(
    escalaId,
    modoAltaDemanda,
    false,
    true
  );
}

/**
 * ==========================================================
 * DELETAR ESCALA
 * ==========================================================
 */

export async function deletarEscalaDaSemana(
  escalaId: string
): Promise<{
  erro?: string;
}> {
  const gerente =
    await requireGerente();

  const supabase =
    await createClient();

  const {
    data: escala,
    error:
      erroEscala,
  } = await supabase
    .from("escalas")
    .select("id")
    .eq(
      "id",
      escalaId
    )
    .eq(
      "restaurante_id",
      gerente.restauranteId
    )
    .maybeSingle();

  if (
    erroEscala
  ) {
    return {
      erro: `Falha ao localizar a escala: ${erroEscala.message}`,
    };
  }

  if (!escala) {
    return {
      erro:
        "Escala não encontrada para este restaurante.",
    };
  }

  const {
    error:
      erroTurnos,
  } = await supabase
    .from("turnos")
    .delete()
    .eq(
      "escala_id",
      escala.id
    )
    .eq(
      "restaurante_id",
      gerente.restauranteId
    );

  if (
    erroTurnos
  ) {
    return {
      erro: `Falha ao deletar os turnos da semana: ${erroTurnos.message}`,
    };
  }

  const {
    error:
      erroDelete,
  } = await supabase
    .from("escalas")
    .delete()
    .eq(
      "id",
      escala.id
    )
    .eq(
      "restaurante_id",
      gerente.restauranteId
    );

  if (
    erroDelete
  ) {
    return {
      erro: `Falha ao deletar a escala: ${erroDelete.message}`,
    };
  }

  revalidatePath(
    "/escalas"
  );

  return {};
}