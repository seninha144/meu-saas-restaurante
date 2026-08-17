"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import {
  dividirIntervalo,
  formatarHoraDoDia,
  horasEfetivasDoTurno,
  intervaloEmMinutos,
} from "@/lib/horas";
import {
  agruparMinimosPorFuncao,
  funcionarioAtendeFuncao,
  normalizarFuncao,
  pontuarCoberturaDia,
  respeitaDescansoMinimo,
  respeitaMaximoDiasConsecutivos,
  type JornadaAbsoluta,
} from "@/lib/escalas/regras-obrigatorias";
import {
  agregarHistoricoTurnos,
  calcularReferenciasJustica,
  desempateSemanal,
  pontuarJusticaDoDia,
  pontuarJusticaHistorica,
  type TurnoHistorico,
} from "@/lib/escalas/historico";
import { getInicioSemana, toISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { PERIODOS, type Periodo } from "@/types/dominio";

const SEXTA = 4;
const SABADO = 5;
const DOMINGO = 6;
const MULTIPLICADOR_COBERTURA_EVENTO = 1.5;

export interface GerarEscalaState {
  erro?: string;
  turnosGerados?: number;
  turnosSubstituidos?: number;
  vagasSemCandidato?: number;
  diasProtegidos?: number;
  horasNaoAlocadas?: number;
  funcionariosComMetaIncompleta?: number;
  confirmarSemanaSeguinte?: boolean;
  semanaInicioGerada?: string;
}

interface PerfilFuncionario {
  id: string;
  cargo: string;
  zonaId: string | null;
  cargaHorariaSemanalMax: number;
  pausaAlmocoMinutos: number;
  diasTrabalhoAlvo: number;
}

type PeriodoOperacional =
  | "Abertura"
  | "Almoço"
  | "Tarde"
  | "Fechamento";

type NivelMovimento =
  | "baixo"
  | "normal"
  | "alto"
  | "muito_alto";

interface SlotNecessidade {
  minimo: number;
  ideal: number;
  maximo: number;
  funcao?: string;
  explicita: boolean;
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

function paraISODateUTC(data: Date): string {
  return `${data.getUTCFullYear()}-${String(
    data.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(data.getUTCDate()).padStart(
    2,
    "0"
  )}`;
}

function inicioDosPeriodos(
  abertura: string,
  fechamento: string
): Record<Periodo, number> {
  const inicios = dividirIntervalo(abertura, fechamento, PERIODOS.length);

  return PERIODOS.reduce(
    (resultado, periodo, indice) => {
      resultado[periodo] = inicios[indice];

      return resultado;
    },
    {} as Record<Periodo, number>
  );
}

function arredondar(horas: number): number {
  return Math.round(horas * 100) / 100;
}

export async function gerarEscalaAutomatica(
  escalaId: string,
  modoAltaDemanda = false,
  substituirTurnosExistentes = false,
  forcarSemanaSeguinte = false
): Promise<GerarEscalaState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const [
    { data: restaurante },
    { data: escalaInicial },
  ] = await Promise.all([
    supabase
      .from("restaurantes")
      .select(
        "usa_zonas, permite_ia, dias_funcionamento, cobertura_fds_prioritaria"
      )
      .eq("id", gerente.restauranteId)
      .single(),

    supabase
      .from("escalas")
      .select(
        "id, semana_inicio, semana_fim"
      )
      .eq("id", escalaId)
      .eq(
        "restaurante_id",
        gerente.restauranteId
      )
      .maybeSingle(),
  ]);

  if (!escalaInicial) {
    return {
      erro:
        "Escala não encontrada para este restaurante.",
    };
  }

  if (
    restaurante &&
    !restaurante.permite_ia
  ) {
    return {
      erro:
        "Seu plano atual não inclui a geração automática de escala. Faça upgrade pra liberar.",
    };
  }

  /*
   * ==========================================================
   * PROTEÇÃO DE FIM DE SEMANA
   * ==========================================================
   */

  const semanaAtualInicio = toISODate(
    getInicioSemana(new Date())
  );

  const hojeDiaSemana =
    new Date().getUTCDay();

  const eFimDeSemana =
    hojeDiaSemana === 0 ||
    hojeDiaSemana === 6;

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
      confirmarSemanaSeguinte: true,
    };
  }

  /*
   * ==========================================================
   * SEMANA SEGUINTE
   * ==========================================================
   */

  let escala = escalaInicial;

  if (forcarSemanaSeguinte) {
    const inicioSeguinte =
      new Date(
        `${escalaInicial.semana_inicio}T00:00:00Z`
      );

    inicioSeguinte.setUTCDate(
      inicioSeguinte.getUTCDate() + 7
    );

    const fimSeguinte =
      new Date(inicioSeguinte);

    fimSeguinte.setUTCDate(
      fimSeguinte.getUTCDate() + 6
    );

    const semanaInicioSeguinte =
      toISODate(inicioSeguinte);

    const {
      data: escalaSeguinteExistente,
      error: erroBuscaSeguinte,
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

    if (erroBuscaSeguinte) {
      return {
        erro: `Falha ao consultar a semana seguinte: ${erroBuscaSeguinte.message}`,
      };
    }

    if (escalaSeguinteExistente) {
      escala =
        escalaSeguinteExistente;
    } else {
      const {
        data: novaEscala,
        error: erroCriacao,
      } = await supabase
        .from("escalas")
        .insert({
          restaurante_id:
            gerente.restauranteId,
          semana_inicio:
            semanaInicioSeguinte,
          semana_fim:
            toISODate(fimSeguinte),
          status: "rascunho",
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
          erro: `Falha ao criar a escala da semana seguinte: ${erroCriacao?.message}`,
        };
      }

      escala = novaEscala;
    }

    escalaId = escala.id;
    substituirTurnosExistentes = false;
  }

  /*
   * ==========================================================
   * TURNOS EXISTENTES
   * ==========================================================
   */

  const {
    data: turnosExistentes,
    error: erroTurnosExistentes,
  } = await supabase
    .from("turnos")
    .select(
      "id, funcionario_id, zona_id, dia_semana, periodo, hora_inicio, hora_fim"
    )
    .eq("escala_id", escala.id)
    .eq(
      "restaurante_id",
      gerente.restauranteId
    );

  if (erroTurnosExistentes) {
    return {
      erro: `Falha ao consultar a escala: ${erroTurnosExistentes.message}`,
    };
  }

  const inicioHistorico = new Date(`${escala.semana_inicio}T00:00:00Z`);
  inicioHistorico.setUTCDate(inicioHistorico.getUTCDate() - 28);

  const { data: escalasHistoricas, error: erroEscalasHistoricas } = await supabase
    .from("escalas")
    .select("id, semana_inicio")
    .eq("restaurante_id", gerente.restauranteId)
    .gte("semana_inicio", toISODate(inicioHistorico))
    .lt("semana_inicio", escala.semana_inicio);

  if (erroEscalasHistoricas) {
    return { erro: `Falha ao consultar o histórico de escalas: ${erroEscalasHistoricas.message}` };
  }

  const idsEscalasHistoricas = (escalasHistoricas ?? []).map((item) => item.id);
  const { data: turnosHistoricosRaw, error: erroTurnosHistoricos } = idsEscalasHistoricas.length
    ? await supabase
        .from("turnos")
        .select("escala_id, funcionario_id, dia_semana, periodo, hora_inicio, hora_fim")
        .in("escala_id", idsEscalasHistoricas)
        .eq("restaurante_id", gerente.restauranteId)
    : { data: [], error: null };

  if (erroTurnosHistoricos) {
    return { erro: `Falha ao consultar turnos históricos: ${erroTurnosHistoricos.message}` };
  }

  const semanasPorEscala = new Map(
    (escalasHistoricas ?? []).map((item) => [item.id, item.semana_inicio])
  );
  const turnosHistoricos: TurnoHistorico[] = (turnosHistoricosRaw ?? []).flatMap(
    (turno) => {
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
    }
  );
  const inicioSemanaAnterior = new Date(`${escala.semana_inicio}T00:00:00Z`);
  inicioSemanaAnterior.setUTCDate(inicioSemanaAnterior.getUTCDate() - 7);
  const semanaAnteriorISO = toISODate(inicioSemanaAnterior);
  const turnosSemanaAnterior = turnosHistoricos.filter(
    (turno) => turno.semanaInicio === semanaAnteriorISO
  );

  const turnosSubstituidos =
    substituirTurnosExistentes
      ? turnosExistentes?.length ?? 0
      : 0;

  if (
    substituirTurnosExistentes &&
    turnosSubstituidos > 0
  ) {
    const { error } =
      await supabase
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

  /*
   * ==========================================================
   * DADOS DO RESTAURANTE
   * ==========================================================
   */

  const [
    { data: zonasRaw },
    { data: funcionariosRaw },
    { data: disponibilidadesRaw },
    { data: horariosRaw },
    { data: movimentosRaw },
    { data: necessidadesRaw },
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
      .eq("ativo", true),

    supabase
      .from("funcionarios")
      .select(
        "id, cargo, zona_id, carga_horaria_semanal_max, folgas_obrigatorias_semana, pausa_almoco_minutos"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      )
      .eq("ativo", true),

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

    supabase
      .from("movimento_operacional")
      .select(
        "dia_semana, periodo, nivel"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      ),

    supabase
      .from("necessidades_equipe")
      .select(
        "dia_semana, periodo, zona_id, funcao, minimo, ideal, maximo"
      )
      .eq(
        "restaurante_id",
        gerente.restauranteId
      ),
  ]);

  const usaZonas =
    restaurante?.usa_zonas ?? true;

  const diasFuncionamento: number[] =
    restaurante?.dias_funcionamento ??
    [0, 1, 2, 3, 4, 5, 6];

  const zonas = zonasRaw ?? [];
  const disponibilidades =
    disponibilidadesRaw ?? [];
  const movimentos =
    movimentosRaw ?? [];
  const necessidades =
    necessidadesRaw ?? [];

  const horariosPorDia =
    new Map<number, HorarioDia>();

  for (
    const horario of
      horariosRaw ?? []
  ) {
    horariosPorDia.set(
      horario.dia_semana,
      {
        fechado:
          horario.fechado,
        abertura:
          horario.hora_abertura?.slice(
            0,
            5
          ) ?? "09:00",
        fechamento:
          horario.hora_fechamento?.slice(
            0,
            5
          ) ?? "23:00",
      }
    );
  }

  const funcionarios: PerfilFuncionario[] =
    (funcionariosRaw ?? []).map(
      (funcionario) => ({
        id: funcionario.id,
        cargo: funcionario.cargo ?? "",
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
              7 -
                Number(
                  funcionario.folgas_obrigatorias_semana
                ),
              diasFuncionamento.length
            )
          ),
      })
    );

  const metricasHistoricas = agregarHistoricoTurnos(
    turnosHistoricos,
    escala.semana_inicio,
    funcionarios.map((funcionario) => funcionario.id)
  );
  const referenciasJustica = calcularReferenciasJustica(
    metricasHistoricas,
    new Map(
      funcionarios.map((funcionario) => [
        funcionario.id,
        funcionario.cargaHorariaSemanalMax,
      ])
    )
  );

  /*
   * ==========================================================
   * DIAS DA SEMANA
   * ==========================================================
   */

  const semanaInicio =
    new Date(
      `${escala.semana_inicio}T00:00:00Z`
    );

  const hojeISO =
    paraISODateUTC(new Date());

  const dataDoDia = (
    dia: number
  ) => {
    const data =
      new Date(semanaInicio);

    data.setUTCDate(
      data.getUTCDate() + dia
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

  /*
   * IMPORTANTE:
   * O restaurante continua sendo a fonte dos horários.
   * A geração nunca altera hora_abertura/hora_fechamento.
   */

  const diasParaProcessar =
    diasFuncionamento
      .filter(
        (dia) =>
          !diasPassados.has(
            dia
          ) &&
          !(
            horariosPorDia.get(
              dia
            )?.fechado ?? false
          )
      )
      .sort((a, b) => {
        if (
          !restaurante?.cobertura_fds_prioritaria
        ) {
          return a - b;
        }

        const peso = (
          dia: number
        ) =>
          dia === SEXTA ||
          dia === SABADO ||
          dia === DOMINGO
            ? 0
            : 1;

        return (
          peso(a) -
            peso(b) ||
          a - b
        );
      });

  /*
   * ==========================================================
   * ESTADO DA ESCALA
   * ==========================================================
   */

  const turnosBase =
    substituirTurnosExistentes
      ? []
      : turnosExistentes ?? [];

  const diasOcupados =
    new Map<
      string,
      Set<number>
    >(
      funcionarios.map(
        (funcionario) => [
          funcionario.id,
          new Set<number>(),
        ]
      )
    );

  const horasRestantes =
    new Map<
      string,
      number
    >(
      funcionarios.map(
        (funcionario) => [
          funcionario.id,
          funcionario.cargaHorariaSemanalMax,
        ]
      )
    );

  const coberturaExistente =
    new Map<
      string,
      number
    >();

  const jornadasPorFuncionario = new Map<string, JornadaAbsoluta[]>(
    funcionarios.map((funcionario) => [funcionario.id, []])
  );

  const diasComJornadaPorFuncionario = new Map<string, Set<number>>(
    funcionarios.map((funcionario) => [funcionario.id, new Set<number>()])
  );

  const adicionarJornadaExistente = (
    funcionarioId: string,
    diaAbsoluto: number,
    horaInicio: string | null,
    horaFim: string | null
  ) => {
    if (!horaInicio || !horaFim || !jornadasPorFuncionario.has(funcionarioId)) return;
    const intervalo = intervaloEmMinutos(horaInicio.slice(0, 5), horaFim.slice(0, 5));
    jornadasPorFuncionario.get(funcionarioId)?.push({
      inicio: diaAbsoluto * 24 * 60 + intervalo.inicio,
      fim: diaAbsoluto * 24 * 60 + intervalo.fim,
    });
    diasComJornadaPorFuncionario.get(funcionarioId)?.add(diaAbsoluto);
  };

  for (const turno of turnosSemanaAnterior ?? []) {
    adicionarJornadaExistente(
      turno.funcionarioId,
      turno.diaSemana - 7,
      turno.horaInicio,
      turno.horaFim
    );
  }

  /*
   * Quantas pessoas estão atualmente
   * trabalhando por zona/dia.
   */
  const trabalhadoresPorDiaZona =
    new Map<
      string,
      number
    >();

  for (
    const turno of turnosBase
  ) {
    adicionarJornadaExistente(
      turno.funcionario_id,
      turno.dia_semana,
      turno.hora_inicio,
      turno.hora_fim
    );
    diasOcupados
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

    if (funcionario) {
      const horas =
        horasEfetivasDoTurno(
          turno.hora_inicio?.slice(
            0,
            5
          ) ?? null,
          turno.hora_fim?.slice(
            0,
            5
          ) ?? null,
          funcionario.pausaAlmocoMinutos
        );

      horasRestantes.set(
        funcionario.id,
        Math.max(
          0,
          (horasRestantes.get(
            funcionario.id
          ) ?? 0) -
            horas
        )
      );
    }

    const chaveCobertura =
      `${
        turno.zona_id ??
        "sem-zona"
      }:${turno.dia_semana}:${turno.periodo}`;

    coberturaExistente.set(
      chaveCobertura,
      (coberturaExistente.get(
        chaveCobertura
      ) ?? 0) + 1
    );

    const chaveDiaZona =
      `${
        turno.zona_id ??
        "sem-zona"
      }:${turno.dia_semana}`;

    trabalhadoresPorDiaZona.set(
      chaveDiaZona,
      (trabalhadoresPorDiaZona.get(
        chaveDiaZona
      ) ?? 0) + 1
    );
  }

  /*
   * ==========================================================
   * DISPONIBILIDADES
   * ==========================================================
   */

  const indisponivelNoDia = (
    funcionarioId: string,
    dia: number
  ) =>
    disponibilidades.some(
      (item) =>
        item.funcionario_id ===
          funcionarioId &&
        item.dia_semana ===
          dia &&
        item.disponivel ===
          false &&
        item.periodo === null
    );

  const periodoIndisponivel = (
    funcionarioId: string,
    dia: number,
    periodo: Periodo
  ) =>
    disponibilidades.some(
      (item) =>
        item.funcionario_id ===
          funcionarioId &&
        item.dia_semana ===
          dia &&
        item.disponivel ===
          false &&
        item.periodo ===
          periodo
    );

  const periodosPreferidos = (
    funcionarioId: string,
    dia: number
  ): Periodo[] =>
    disponibilidades
      .filter(
        (item) =>
          item.funcionario_id ===
            funcionarioId &&
          item.dia_semana ===
            dia &&
          item.disponivel &&
          item.periodo
      )
      .map(
        (item) =>
          item.periodo as Periodo
      );

  /*
   * ==========================================================
   * HORÁRIO REAL DO RESTAURANTE
   * ==========================================================
   */

  const horarioDoTurno = (
    funcionario: PerfilFuncionario,
    dia: number,
    periodo: Periodo
  ) => {
    const horario =
      horariosPorDia.get(
        dia
      );

    if (
      !horario ||
      horario.fechado
    ) {
      return null;
    }

    const { inicio: abertura, fim: fechamento } =
      intervaloEmMinutos(horario.abertura, horario.fechamento);

    const inicioPeriodo =
      inicioDosPeriodos(
        horario.abertura,
        horario.fechamento
      )[periodo];

    const horasMaximas =
      Math.max(
        0,
        (fechamento -
          abertura -
          funcionario.pausaAlmocoMinutos) /
          60
      );

    return horasMaximas > 0
      ? {
          abertura,
          fechamento,
          inicioPeriodo,
          horasMaximas,
        }
      : null;
  };

  /*
   * ==========================================================
   * DEMANDA POR DIA
   * ==========================================================
   */

  const periodoOperacionalDoTurno = (
    periodo: Periodo
  ): PeriodoOperacional => {
    /*
     * Os períodos operacionais do onboarding são diferentes
     * dos períodos gravados em turnos.
     * Mantemos o mapeamento explícito para não misturar
     * Periodo com PeriodoDisponibilidade.
     */
    switch (periodo) {
      case "Manhã":
        return "Abertura";
      case "Tarde":
        return "Almoço";
      case "Noite":
        return "Tarde";
      case "Fechamento":
        return "Fechamento";
    }
  };

  const nivelMovimento = (
    dia: number,
    periodo: Periodo
  ): NivelMovimento | null => {
    const periodoOperacional =
      periodoOperacionalDoTurno(periodo);

    const movimento = movimentos.find(
      (item) =>
        item.dia_semana === dia &&
        item.periodo === periodoOperacional
    );

    return (
      movimento?.nivel as NivelMovimento | undefined
    ) ?? null;
  };

  const multiplicadorMovimento = (
    nivel: NivelMovimento
  ) => {
    switch (nivel) {
      case "baixo":
        return 0.7;
      case "normal":
        return 1;
      case "alto":
        return 1.3;
      case "muito_alto":
        return 1.6;
    }
  };

  const linhasNecessidadeDoSlot = (
    zonaId: string | null,
    dia: number,
    periodo: Periodo
  ) => {
    const periodoOperacional =
      periodoOperacionalDoTurno(periodo);

    const candidatas = necessidades.filter(
      (item) =>
        item.dia_semana === dia &&
        item.periodo === periodoOperacional &&
        (item.zona_id === zonaId ||
          item.zona_id === null)
    );

    const zonaEspecifica =
      candidatas.filter(
        (item) => item.zona_id === zonaId
      );

    const linhas =
      zonaEspecifica.length > 0
        ? zonaEspecifica
        : candidatas.filter(
            (item) => item.zona_id === null
          );

    const comFuncao = linhas.filter(
      (item) =>
        typeof item.funcao === "string" &&
        item.funcao.trim().length > 0
    );

    return comFuncao.length > 0
      ? comFuncao
      : linhas.filter(
          (item) =>
            !item.funcao ||
            item.funcao.trim().length === 0
        );
  };

  const chaveCoberturaFuncao = (
    zonaId: string | null,
    dia: number,
    periodo: Periodo,
    funcao: string
  ) => `${zonaId ?? "sem-zona"}:${dia}:${periodo}:${normalizarFuncao(funcao)}`;

  const coberturaFuncaoNova = new Map<string, number>();

  for (const turno of turnosBase) {
    const funcionario = funcionarios.find((item) => item.id === turno.funcionario_id);
    if (!funcionario?.cargo.trim()) continue;
    const periodo = turno.periodo as Periodo;
    const funcoesExigidas = agruparMinimosPorFuncao(
      linhasNecessidadeDoSlot(turno.zona_id, turno.dia_semana, periodo)
    );
    const cargo = normalizarFuncao(funcionario.cargo);
    if (!funcoesExigidas.has(cargo)) continue;
    const chave = chaveCoberturaFuncao(turno.zona_id, turno.dia_semana, periodo, cargo);
    coberturaFuncaoNova.set(chave, (coberturaFuncaoNova.get(chave) ?? 0) + 1);
  }

  const resolverNecessidade = (
    zonaId: string | null,
    dia: number,
    periodo: Periodo
  ): SlotNecessidade => {
    const linhas =
      linhasNecessidadeDoSlot(
        zonaId,
        dia,
        periodo
      );

    if (linhas.length > 0) {
      const minimo = linhas.reduce(
        (total, item) =>
          total + Math.max(0, Number(item.minimo ?? 0)),
        0
      );
      const ideal = linhas.reduce(
        (total, item) =>
          total + Math.max(0, Number(item.ideal ?? 0)),
        0
      );
      const maximo = linhas.reduce(
        (total, item) =>
          total + Math.max(0, Number(item.maximo ?? 0)),
        0
      );

      return {
        minimo: Math.min(minimo, ideal),
        ideal: Math.max(
          minimo,
          ideal
        ),
        maximo: Math.max(
          ideal,
          maximo
        ),
        funcao:
          linhas.length === 1
            ? linhas[0].funcao?.trim() || undefined
            : undefined,
        explicita: true,
      };
    }

    const zona =
      zonas.find(
        (item) => item.id === zonaId
      );

    const capacidadeBase =
      zona
        ? Math.max(
            zona.capacidade_minima,
            1
          )
        : 1;

    const nivel = nivelMovimento(
      dia,
      periodo
    );

    if (nivel) {
      const ideal = Math.ceil(
        capacidadeBase *
          multiplicadorMovimento(nivel)
      );

      return {
        /*
         * Mesmo com movimento baixo, um período operacional
         * aberto precisa de uma cobertura mínima operacional.
         * O valor continua sendo 1 apenas no fallback de movimento;
         * necessidades_equipe explícitas continuam a ter prioridade.
         */
        minimo: 1,
        ideal,
        maximo: ideal + 1,
        explicita: false,
      };
    }

    const ideal = modoAltaDemanda
      ? Math.ceil(
          capacidadeBase *
            MULTIPLICADOR_COBERTURA_EVENTO
        )
      : capacidadeBase;

    return {
      minimo: capacidadeBase,
      ideal,
      maximo: ideal,
      explicita: false,
    };
  };

  const capacidadeDiaZona = (
    zonaId: string | null,
    dia: number
  ) => {
    if (
      !horariosPorDia.has(
        dia
      )
    ) {
      return 0;
    }

    return PERIODOS.reduce(
      (total, periodo) =>
        total +
        resolverNecessidade(
          zonaId,
          dia,
          periodo
        ).ideal,
      0
    );
  };

  const minimoDiaZona = (
    zonaId: string | null,
    dia: number
  ) => {
    if (
      !horariosPorDia.has(
        dia
      )
    ) {
      return 0;
    }

    return PERIODOS.reduce(
      (maiorMinimo, periodo) =>
        Math.max(
          maiorMinimo,
          resolverNecessidade(
            zonaId,
            dia,
            periodo
          ).minimo
        ),
      0
    );
  };

  const idealDiaZona = (
    zonaId: string | null,
    dia: number
  ) => {
    if (!horariosPorDia.has(dia)) return 0;

    return PERIODOS.reduce(
      (maiorIdeal, periodo) =>
        Math.max(
          maiorIdeal,
          resolverNecessidade(zonaId, dia, periodo).ideal
        ),
      0
    );
  };

  /*
   * ==========================================================
   * PLANEAMENTO DOS DIAS DE TRABALHO
   * ==========================================================
   *
   * Esta é a principal mudança.
   *
   * Antes:
   *
   *   dia -> escolher funcionários
   *
   * Agora:
   *
   *   funcionário -> escolher dias
   *   semana inteira -> equilibrar cobertura
   */

  const diasTrabalhoPlanejados =
    new Map<
      string,
      Set<number>
    >(
      funcionarios.map(
        (funcionario) => [
          funcionario.id,
          new Set<number>(
            diasOcupados.get(
              funcionario.id
            ) ?? []
          ),
        ]
      )
    );

  /*
   * Quanto menor a cobertura do dia,
   * maior a prioridade para trabalhar nele.
   */
  const scoreDia = (
    funcionario: PerfilFuncionario,
    dia: number,
    escolhidos: Set<number>
  ) => {
    const zonaId = usaZonas
      ? funcionario.zonaId
      : null;

    const chave =
      `${
        zonaId ??
        "sem-zona"
      }:${dia}`;

    const trabalhadores =
      trabalhadoresPorDiaZona.get(
        chave
      ) ?? 0;

    const minimo =
      minimoDiaZona(
        zonaId,
        dia
      );

    const ideal = idealDiaZona(zonaId, dia);

    let score = pontuarCoberturaDia(trabalhadores, minimo, ideal);

    /*
     * Se o restaurante marcou
     * cobertura de fim de semana como prioritária,
     * damos uma pequena vantagem.
     */
    if (
      restaurante?.cobertura_fds_prioritaria &&
      (
        dia === SEXTA ||
        dia === SABADO ||
        dia === DOMINGO
      )
    ) {
      score += 12;
    }

    const metricas = metricasHistoricas.get(funcionario.id);
    if (metricas) {
      score += pontuarJusticaDoDia(
        metricas,
        funcionario.cargaHorariaSemanalMax,
        referenciasJustica,
        dia
      );
    }

    /*
     * Evita sequências muito concentradas.
     */
    const anterior =
      dia > 0 &&
      escolhidos.has(
        dia - 1
      );

    const seguinte =
      dia < 6 &&
      escolhidos.has(
        dia + 1
      );

    if (
      anterior &&
      seguinte
    ) {
      score -= 18;
    }

    if (anterior) {
      score -= 3;
    }

    if (seguinte) {
      score -= 3;
    }

    /*
     * Desempate determinístico.
     */
    score +=
      (6 - dia) * 0.01;

    return score;
  };

  /*
   * Primeiro damos prioridade aos funcionários
   * que ainda precisam de mais dias.
   */
  const paraPlanejar =
    [...funcionarios].sort(
      (a, b) => {
        const faltaA =
          Math.max(
            0,
            a.diasTrabalhoAlvo -
              (
                diasTrabalhoPlanejados.get(
                  a.id
                )?.size ?? 0
              )
          );

        const faltaB =
          Math.max(
            0,
            b.diasTrabalhoAlvo -
              (
                diasTrabalhoPlanejados.get(
                  b.id
                )?.size ?? 0
              )
          );

        return (
          faltaB -
            faltaA ||
          desempateSemanal(`${escala.semana_inicio}:${b.id}:planejamento`) -
            desempateSemanal(`${escala.semana_inicio}:${a.id}:planejamento`)
        );
      }
    );

  /*
   * Escolhe os dias de cada funcionário.
   */
  for (
    const funcionario of
      paraPlanejar
  ) {
    const escolhidos =
      diasTrabalhoPlanejados.get(
        funcionario.id
      )!;

    const faltam =
      Math.max(
        0,
        funcionario.diasTrabalhoAlvo -
          escolhidos.size
      );

    for (
      let i = 0;
      i < faltam;
      i++
    ) {
      const candidatos =
        diasParaProcessar
          .filter(
            (dia) => {
              if (
                escolhidos.has(
                  dia
                )
              ) {
                return false;
              }

              if (
                indisponivelNoDia(
                  funcionario.id,
                  dia
                )
              ) {
                return false;
              }

              if (
                usaZonas &&
                !funcionario.zonaId
              ) {
                return false;
              }

              const diasComJornada = new Set([
                ...(diasComJornadaPorFuncionario.get(funcionario.id) ?? []),
                ...escolhidos,
              ]);

              if (!respeitaMaximoDiasConsecutivos(diasComJornada, dia)) {
                return false;
              }

              return true;
            }
          )
          .sort(
            (a, b) =>
              scoreDia(
                funcionario,
                b,
                escolhidos
              ) -
              scoreDia(
                funcionario,
                a,
                escolhidos
              )
          );

      const dia =
        candidatos[0];

      if (
        dia === undefined
      ) {
        break;
      }

      escolhidos.add(
        dia
      );

      const zonaId =
        usaZonas
          ? funcionario.zonaId
          : null;

      const chave =
        `${
          zonaId ??
          "sem-zona"
        }:${dia}`;

      trabalhadoresPorDiaZona.set(
        chave,
        (
          trabalhadoresPorDiaZona.get(
            chave
          ) ?? 0
        ) + 1
      );
    }
  }

  /*
   * ==========================================================
   * DISTRIBUIÇÃO DOS TURNOS
   * ==========================================================
   */

  const novosTurnos: TurnoNovo[] =
    [];

  const coberturaNova =
    new Map(
      coberturaExistente
    );

  const horasPlanejadas = (
    funcionario: PerfilFuncionario,
    dia: number,
    periodo: Periodo
  ) => {
    const horario =
      horarioDoTurno(
        funcionario,
        dia,
        periodo
      );

    if (!horario) {
      return 0;
    }

    const restantes =
      horasRestantes.get(
        funcionario.id
      ) ?? 0;

    const planejados =
      diasTrabalhoPlanejados.get(
        funcionario.id
      )?.size ?? 0;

    const ocupados =
      diasOcupados.get(
        funcionario.id
      )?.size ?? 0;

    const diasRestantes =
      Math.max(
        1,
        planejados -
          ocupados
      );

    if (
      restantes <= 0
    ) {
      return 0;
    }

    return Math.min(
      restantes /
        diasRestantes,
      horario.horasMaximas
    );
  };

  const alocar = (
    funcionario: PerfilFuncionario,
    zonaId: string | null,
    dia: number,
    periodo: Periodo,
    foraPreferencia: boolean,
    funcaoObrigatoria?: string
  ) => {
    const horario =
      horarioDoTurno(
        funcionario,
        dia,
        periodo
      );

    if (!horario) {
      return false;
    }

    const planejados =
      diasTrabalhoPlanejados.get(
        funcionario.id
      )!;

    const diaFoiAdicionadoAoPlanejamento =
      !planejados.has(dia);

    let diaAntigoTrocado: number | null =
      null;

    /*
     * Durante a garantia de cobertura mínima, podemos precisar
     * trazer um funcionário para um dia que ainda não estava
     * planeado para ele. Isso só é permitido enquanto ele ainda
     * não atingiu o número alvo de dias da semana.
     */
    if (
      diaFoiAdicionadoAoPlanejamento
    ) {
      if (
        planejados.size >=
        funcionario.diasTrabalhoAlvo
      ) {
        diaAntigoTrocado =
          tentarTrocarDiaPlanejado(
            funcionario,
            dia
          );

        if (diaAntigoTrocado === null) {
          return false;
        }
      } else {
        planejados.add(dia);

        const chaveDiaZona =
          `${
          zonaId ??
          "sem-zona"
        }:${dia}`;

        trabalhadoresPorDiaZona.set(
          chaveDiaZona,
          (
            trabalhadoresPorDiaZona.get(
              chaveDiaZona
            ) ?? 0
          ) + 1
        );
      }
    }

    const horas =
      horasPlanejadas(
        funcionario,
        dia,
        periodo
      );

    const inicio = Math.max(
      horario.abertura,
      Math.min(
        horario.inicioPeriodo,
        horario.fechamento - (horas * 60 + funcionario.pausaAlmocoMinutos)
      )
    );
    const novaJornada = {
      inicio: dia * 24 * 60 + inicio,
      fim:
        dia * 24 * 60 +
        inicio +
        horas * 60 +
        funcionario.pausaAlmocoMinutos,
    };
    const respeitaRegrasObrigatorias =
      respeitaMaximoDiasConsecutivos(
        diasComJornadaPorFuncionario.get(funcionario.id) ?? [],
        dia
      ) &&
      respeitaDescansoMinimo(
        jornadasPorFuncionario.get(funcionario.id) ?? [],
        novaJornada
      );

    if (
      horas <= 0 ||
      !respeitaRegrasObrigatorias
    ) {
      if (diaAntigoTrocado !== null) {
        const chaveAntiga =
          `${
            zonaId ??
            "sem-zona"
          }:${diaAntigoTrocado}`;
        const chaveNova =
          `${
            zonaId ??
            "sem-zona"
          }:${dia}`;

        planejados.delete(dia);
        planejados.add(diaAntigoTrocado);

        trabalhadoresPorDiaZona.set(
          chaveNova,
          Math.max(
            0,
            (
              trabalhadoresPorDiaZona.get(
                chaveNova
              ) ?? 1
            ) - 1
          )
        );
        trabalhadoresPorDiaZona.set(
          chaveAntiga,
          (
            trabalhadoresPorDiaZona.get(
              chaveAntiga
            ) ?? 0
          ) + 1
        );
      } else if (diaFoiAdicionadoAoPlanejamento) {
        planejados.delete(dia);

        const chaveDiaZona =
          `${
            zonaId ??
            "sem-zona"
          }:${dia}`;

        trabalhadoresPorDiaZona.set(
          chaveDiaZona,
          Math.max(
            0,
            (
              trabalhadoresPorDiaZona.get(
                chaveDiaZona
              ) ?? 1
            ) - 1
          )
        );
      }

      return false;
    }

    const necessidade =
      resolverNecessidade(
        zonaId,
        dia,
        periodo
      );

    const chaveCobertura =
      `${
        zonaId ??
        "sem-zona"
      }:${dia}:${periodo}`;

    const coberturaAtual =
      coberturaNova.get(
        chaveCobertura
      ) ?? 0;

    if (
      coberturaAtual >=
      necessidade.maximo
    ) {
      if (diaAntigoTrocado !== null) {
        const chaveAntiga =
          `${
            zonaId ??
            "sem-zona"
          }:${diaAntigoTrocado}`;
        const chaveNova =
          `${
            zonaId ??
            "sem-zona"
          }:${dia}`;

        planejados.delete(dia);
        planejados.add(diaAntigoTrocado);

        trabalhadoresPorDiaZona.set(
          chaveNova,
          Math.max(
            0,
            (
              trabalhadoresPorDiaZona.get(
                chaveNova
              ) ?? 1
            ) - 1
          )
        );
        trabalhadoresPorDiaZona.set(
          chaveAntiga,
          (
            trabalhadoresPorDiaZona.get(
              chaveAntiga
            ) ?? 0
          ) + 1
        );
      } else if (diaFoiAdicionadoAoPlanejamento) {
        planejados.delete(dia);

        const chaveDiaZona =
          `${
            zonaId ??
            "sem-zona"
          }:${dia}`;

        trabalhadoresPorDiaZona.set(
          chaveDiaZona,
          Math.max(
            0,
            (
              trabalhadoresPorDiaZona.get(
                chaveDiaZona
              ) ?? 1
            ) - 1
          )
        );
      }

      return false;
    }

    novosTurnos.push({
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
        formatarHoraDoDia(inicio),

      hora_fim:
        formatarHoraDoDia(
          inicio +
            horas * 60 +
            funcionario.pausaAlmocoMinutos
        ),

      fora_preferencia:
        foraPreferencia,

      status:
        "agendado",
    });

    diasOcupados
      .get(
        funcionario.id
      )
      ?.add(dia);

    jornadasPorFuncionario.get(funcionario.id)?.push(novaJornada);
    diasComJornadaPorFuncionario.get(funcionario.id)?.add(dia);

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

    coberturaNova.set(
      chaveCobertura,
      (
        coberturaNova.get(
          chaveCobertura
        ) ?? 0
      ) + 1
    );

    if (funcaoObrigatoria) {
      const chaveFuncao = chaveCoberturaFuncao(
        zonaId,
        dia,
        periodo,
        funcaoObrigatoria
      );
      coberturaFuncaoNova.set(
        chaveFuncao,
        (coberturaFuncaoNova.get(chaveFuncao) ?? 0) + 1
      );
    }

    return true;
  };
  /*
   * ==========================================================
   * ESCOLHA DO FUNCIONÁRIO PARA CADA PERÍODO
   * ==========================================================
   */

  const encontrarDiaPlanejadoParaTroca = (
    funcionario: PerfilFuncionario,
    diaNovo: number
  ) => {
    const planejados =
      diasTrabalhoPlanejados.get(
        funcionario.id
      );

    if (!planejados || planejados.has(diaNovo)) {
      return null;
    }

    const ocupados =
      diasOcupados.get(
        funcionario.id
      );

    const zonaId =
      usaZonas
        ? funcionario.zonaId
        : null;

    if (
      indisponivelNoDia(
        funcionario.id,
        diaNovo
      ) ||
      (
        usaZonas &&
        !zonaId
      )
    ) {
      return null;
    }

    const candidatos =
      [...planejados]
        .filter(
          (diaAntigo) => {
            if (
              diaAntigo === diaNovo ||
              ocupados?.has(diaAntigo) ||
              diasPassados.has(diaAntigo)
            ) {
              return false;
            }

            const chaveAntiga =
              `${
                zonaId ??
                "sem-zona"
              }:${diaAntigo}`;

            const trabalhadoresAntigos =
              trabalhadoresPorDiaZona.get(
                chaveAntiga
              ) ?? 0;

            const minimoAntigo =
              minimoDiaZona(
                zonaId,
                diaAntigo
              );

            return (
              trabalhadoresAntigos >
              minimoAntigo
            );
          }
        )
        .sort(
          (a, b) => {
            const excessoA =
              (
                trabalhadoresPorDiaZona.get(
                  `${
                    zonaId ??
                    "sem-zona"
                  }:${a}`
                ) ?? 0
              ) -
              minimoDiaZona(
                zonaId,
                a
              );

            const excessoB =
              (
                trabalhadoresPorDiaZona.get(
                  `${
                    zonaId ??
                    "sem-zona"
                  }:${b}`
                ) ?? 0
              ) -
              minimoDiaZona(
                zonaId,
                b
              );

            return (
              excessoB -
              excessoA ||
              b - a
            );
          }
        );

    return (
      candidatos[0] ??
      null
    );
  };

  const tentarTrocarDiaPlanejado = (
    funcionario: PerfilFuncionario,
    diaNovo: number
  ): number | null => {
    const planejados =
      diasTrabalhoPlanejados.get(
        funcionario.id
      );

    const diaAntigo =
      encontrarDiaPlanejadoParaTroca(
        funcionario,
        diaNovo
      );

    if (
      !planejados ||
      diaAntigo === null
    ) {
      return null;
    }

    const zonaId =
      usaZonas
        ? funcionario.zonaId
        : null;

    planejados.delete(
      diaAntigo
    );
    planejados.add(
      diaNovo
    );

    const chaveAntiga =
      `${
        zonaId ??
        "sem-zona"
      }:${diaAntigo}`;

    const chaveNova =
      `${
        zonaId ??
        "sem-zona"
      }:${diaNovo}`;

    trabalhadoresPorDiaZona.set(
      chaveAntiga,
      Math.max(
        0,
        (
          trabalhadoresPorDiaZona.get(
            chaveAntiga
          ) ?? 1
        ) - 1
      )
    );

    trabalhadoresPorDiaZona.set(
      chaveNova,
      (
        trabalhadoresPorDiaZona.get(
          chaveNova
        ) ?? 0
      ) + 1
    );

    return diaAntigo;
  };
  const escolherFuncionario = (
    zonaId: string | null,
    dia: number,
    periodo: Periodo,
    respeitarPreferencia: boolean,
    permitirDiaNaoPlanejado = false,
    funcaoObrigatoria?: string
  ) =>
    funcionarios
      .filter(
        (funcionario) => {
          if (
            funcaoObrigatoria &&
            !funcionarioAtendeFuncao(funcionario.cargo, funcaoObrigatoria)
          ) {
            return false;
          }
          if (
            usaZonas &&
            funcionario.zonaId !==
              zonaId
          ) {
            return false;
          }

          if (
            diasOcupados
              .get(
                funcionario.id
              )
              ?.has(dia)
          ) {
            return false;
          }

          /*
           * FUNDAMENTAL:
           * ele só pode trabalhar neste dia
           * se o planeamento semanal tiver escolhido
           * este dia para ele.
           */
          const planejados =
            diasTrabalhoPlanejados.get(
              funcionario.id
            );

          if (
            !planejados?.has(dia)
          ) {
            if (!permitirDiaNaoPlanejado) {
              return false;
            }

            if (
              planejados &&
              planejados.size >=
                funcionario.diasTrabalhoAlvo
            ) {
              if (
                !encontrarDiaPlanejadoParaTroca(
                  funcionario,
                  dia
                )
              ) {
                return false;
              }
            }
          }

          if (
            indisponivelNoDia(
              funcionario.id,
              dia
            )
          ) {
            return false;
          }

          if (
            periodoIndisponivel(
              funcionario.id,
              dia,
              periodo
            )
          ) {
            return false;
          }

          if (
            (
              horasRestantes.get(
                funcionario.id
              ) ?? 0
            ) <= 0
          ) {
            return false;
          }

          const necessidade =
            resolverNecessidade(
              zonaId,
              dia,
              periodo
            );

          const coberturaAtual =
            coberturaNova.get(
              `${
                zonaId ??
                "sem-zona"
              }:${dia}:${periodo}`
            ) ?? 0;

          if (
            coberturaAtual >=
            necessidade.maximo
          ) {
            return false;
          }

          const preferencias =
            periodosPreferidos(
              funcionario.id,
              dia
            );

          if (
            respeitarPreferencia &&
            preferencias.length >
              0 &&
            !preferencias.includes(
              periodo
            )
          ) {
            return false;
          }

          const horario = horarioDoTurno(funcionario, dia, periodo);
          const horas = horasPlanejadas(funcionario, dia, periodo);

          if (!horario || horas <= 0) return false;

          const inicio = Math.max(
            horario.abertura,
            Math.min(
              horario.inicioPeriodo,
              horario.fechamento - (horas * 60 + funcionario.pausaAlmocoMinutos)
            )
          );
          const jornada = {
            inicio: dia * 24 * 60 + inicio,
            fim:
              dia * 24 * 60 +
              inicio +
              horas * 60 +
              funcionario.pausaAlmocoMinutos,
          };

          return (
            respeitaMaximoDiasConsecutivos(
              diasComJornadaPorFuncionario.get(funcionario.id) ?? [],
              dia
            ) &&
            respeitaDescansoMinimo(
              jornadasPorFuncionario.get(funcionario.id) ?? [],
              jornada
            )
          );
        }
      )
      .sort(
        (a, b) => {
          const scoreFuncionario = (
            funcionario: PerfilFuncionario
          ) => {
            const preferencias =
              periodosPreferidos(
                funcionario.id,
                dia
              );

            let score = preferencias.includes(
              periodo
            )
              ? 30
              : 0;

            const linhas =
              linhasNecessidadeDoSlot(
                zonaId,
                dia,
                periodo
              );

            const cargo =
              funcionario.cargo.trim().toLowerCase();

            if (
              cargo &&
              linhas.some(
                (linha) =>
                  typeof linha.funcao === "string" &&
                  linha.funcao.trim().toLowerCase() ===
                    cargo
              )
            ) {
              score += 25;
            }

            score +=
              (horasRestantes.get(
                funcionario.id
              ) ?? 0) * 0.01;

            const metricas = metricasHistoricas.get(funcionario.id);
            if (metricas) {
              score += pontuarJusticaHistorica(
                metricas,
                funcionario.cargaHorariaSemanalMax,
                referenciasJustica,
                dia,
                periodo
              );
            }

            return score;
          };

          return (
            scoreFuncionario(b) -
              scoreFuncionario(a) ||
            desempateSemanal(
              `${escala.semana_inicio}:${b.id}:${dia}:${periodo}:${zonaId ?? "sem-zona"}`
            ) -
              desempateSemanal(
                `${escala.semana_inicio}:${a.id}:${dia}:${periodo}:${zonaId ?? "sem-zona"}`
              )
          );
        }
      )[0];

  /*
   * ==========================================================
   * ORDEM DOS DIAS
   * ==========================================================
   */

  let vagasSemCandidato =
    0;

  const diasOrdenados =
    [...diasParaProcessar].sort(
      (a, b) => {
        const demanda = (
          dia: number
        ) =>
          (
            usaZonas
              ? zonas
              : [null]
          ).reduce(
            (
              total,
              zona
            ) =>
              total +
              capacidadeDiaZona(
                zona?.id ??
                  null,
                dia
              ),
            0
          );

        const diferenca =
          demanda(b) -
          demanda(a);

        if (
          diferenca !==
          0
        ) {
          return diferenca;
        }

        if (
          restaurante?.cobertura_fds_prioritaria
        ) {
          const peso =
            (
              dia: number
            ) =>
              dia ===
                SEXTA ||
              dia ===
                SABADO ||
              dia ===
                DOMINGO
                ? 0
                : 1;

          return (
            peso(a) -
            peso(b)
          );
        }

        return a - b;
      }
    );

  /*
   * ==========================================================
   * COBERTURA MÍNIMA
   * ==========================================================
   *
   * Primeiro garantimos o piso operacional de cada slot.
   * Só depois tentamos chegar ao ideal.
   *
   * Isto evita que um período aberto fique vazio apenas porque
   * a distribuição anterior consumiu os candidatos noutros
   * períodos.
   */

  for (
    const dia of
      diasOrdenados
  ) {
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

    for (
      const zona of
        zonasDaEscala
    ) {
      const zonaId =
        zona?.id ?? null;

      for (
        const periodo of
          PERIODOS
      ) {
        const chave =
          `${
            zonaId ??
            "sem-zona"
          }:${dia}:${periodo}`;

        const necessidade =
          resolverNecessidade(
            zonaId,
            dia,
            periodo
          );

        const minimosPorFuncao = agruparMinimosPorFuncao(
          linhasNecessidadeDoSlot(zonaId, dia, periodo)
        );

        for (const [funcao, minimo] of minimosPorFuncao) {
          const chaveFuncao = chaveCoberturaFuncao(zonaId, dia, periodo, funcao);
          let faltamFuncao = Math.max(
            0,
            minimo - (coberturaFuncaoNova.get(chaveFuncao) ?? 0)
          );

          for (const respeitarPreferencia of [true, false]) {
            while (faltamFuncao > 0) {
              const candidato = escolherFuncionario(
                zonaId,
                dia,
                periodo,
                respeitarPreferencia,
                true,
                funcao
              );

              if (!candidato) break;

              const alocado = alocar(
                candidato,
                zonaId,
                dia,
                periodo,
                !periodosPreferidos(candidato.id, dia).includes(periodo),
                funcao
              );

              if (!alocado) break;
              faltamFuncao--;
            }

            if (faltamFuncao <= 0) break;
          }

          vagasSemCandidato += faltamFuncao;
        }

        let faltam =
          Math.max(
            0,
            necessidade.minimo -
              (
                coberturaNova.get(
                  chave
                ) ?? 0
              )
          );

        /*
         * Primeiro tentamos manter as preferências.
         * Se isso não for suficiente, sacrificamos a preferência
         * antes de aceitar uma falha de cobertura mínima.
         */
        for (
          const respeitarPreferencia of [
            true,
            false,
          ]
        ) {
          while (
            faltam > 0
          ) {
            const candidato =
              escolherFuncionario(
                zonaId,
                dia,
                periodo,
                respeitarPreferencia,
                true
              );

            if (!candidato) {
              break;
            }

            const alocado =
              alocar(
                candidato,
                zonaId,
                dia,
                periodo,
                !periodosPreferidos(
                  candidato.id,
                  dia
                ).includes(periodo)
              );

            if (!alocado) {
              break;
            }

            faltam--;
          }

          if (faltam <= 0) {
            break;
          }
        }

        if (faltam > 0) {
          vagasSemCandidato +=
            faltam;
        }
      }
    }
  }

  /*
   * ==========================================================
   * COBERTURA IDEAL
   * ==========================================================
   *
   * Com todos os pisos atendidos tanto quanto possível,
   * aproximamos cada slot do alvo ideal. Nesta fase já não
   * adicionamos dias fora do planeamento semanal.
   */

  for (
    const dia of
      diasOrdenados
  ) {
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

    for (
      const zona of
        zonasDaEscala
    ) {
      const zonaId =
        zona?.id ?? null;

      /*
       * Primeiro tenta respeitar a preferência.
       * Depois pode sair dela se faltar cobertura ideal.
       */
      for (
        const respeitarPreferencia of [
          true,
          false,
        ]
      ) {
        for (
          const periodo of
            PERIODOS
        ) {
          const chave =
            `${
              zonaId ??
              "sem-zona"
            }:${dia}:${periodo}`;

          const necessidade =
            resolverNecessidade(
              zonaId,
              dia,
              periodo
            );

          let faltam =
            Math.max(
              0,
              necessidade.ideal -
                (
                  coberturaNova.get(
                    chave
                  ) ?? 0
                )
            );

          while (
            faltam > 0
          ) {
            const candidato =
              escolherFuncionario(
                zonaId,
                dia,
                periodo,
                respeitarPreferencia,
                false
              );

            if (!candidato) {
              break;
            }

            const alocado =
              alocar(
                candidato,
                zonaId,
                dia,
                periodo,
                !respeitarPreferencia
              );

            if (!alocado) {
              break;
            }

            faltam--;
          }

          /*
           * A falta do ideal não é tratada como vaga impossível.
           * A métrica crítica é o mínimo; o ideal é um objetivo
           * de otimização que pode ficar abaixo quando a equipa
           * disponível não comporta mais pessoas.
           */
        }
      }
    }
  }

  /*
   * ==========================================================
   * COMPLETAR DIAS PLANEJADOS
   * ==========================================================
   *
   * Se alguém foi escolhido para trabalhar num dia,
   * mas ainda não recebeu um turno durante a etapa de cobertura,
   * tentamos colocá-lo no melhor período possível.
   */

  for (
    const funcionario of
      [...funcionarios].sort(
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
    const planejados =
      diasTrabalhoPlanejados.get(
        funcionario.id
      ) ??
      new Set<number>();

    for (
      const dia of
        [...planejados].sort(
          (a, b) => a - b
        )
    ) {
      if (
        diasOcupados
          .get(
            funcionario.id
          )
          ?.has(dia)
      ) {
        continue;
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
          funcionario.id,
          dia
        );

      const periodos =
        [...PERIODOS].sort(
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

            return (
              (
                horarioDoTurno(
                  funcionario,
                  dia,
                  b
                )?.horasMaximas ??
                0
              ) -
              (
                horarioDoTurno(
                  funcionario,
                  dia,
                  a
                )?.horasMaximas ??
                0
              )
            );
          }
        );

      for (
        const periodo of
          periodos
      ) {
        if (
          periodoIndisponivel(
            funcionario.id,
            dia,
            periodo
          )
        ) {
          continue;
        }

        const alocado =
          alocar(
            funcionario,
            zonaId,
            dia,
            periodo,
            preferencias.length >
              0 &&
              !preferencias.includes(
                periodo
              )
          );

        if (
          alocado
        ) {
          break;
        }
      }
    }
  }

  /*
   * ==========================================================
   * GRAVAR
   * ==========================================================
   */

  if (
    novosTurnos.length >
    0
  ) {
    const { error } =
      await supabase
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
    error: erroEscala,
  } = await supabase
    .from("escalas")
    .select("id")
    .eq("id", escalaId)
    .eq(
      "restaurante_id",
      gerente.restauranteId
    )
    .maybeSingle();

  if (erroEscala) {
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
    error: erroTurnos,
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

  if (erroTurnos) {
    return {
      erro: `Falha ao deletar os turnos da semana: ${erroTurnos.message}`,
    };
  }

  const {
    error: erroDelete,
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

  if (erroDelete) {
    return {
      erro: `Falha ao deletar a escala: ${erroDelete.message}`,
    };
  }

  revalidatePath(
    "/escalas"
  );

  return {};
}
