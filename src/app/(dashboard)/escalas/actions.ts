"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { horasEfetivasDoTurno } from "@/lib/horas";
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

function paraMinutos(hora: string): number {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function paraHora(minutos: number): string {
  const normalizado = Math.round(minutos);

  return `${String(Math.floor(normalizado / 60)).padStart(
    2,
    "0"
  )}:${String(normalizado % 60).padStart(2, "0")}`;
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
  const inicio = paraMinutos(abertura);
  const fim = paraMinutos(fechamento);

  const bloco =
    Math.max(
      fim - inicio,
      PERIODOS.length * 30
    ) / PERIODOS.length;

  return PERIODOS.reduce(
    (resultado, periodo, indice) => {
      resultado[periodo] =
        inicio + bloco * indice;

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
        "id, zona_id, carga_horaria_semanal_max, folgas_obrigatorias_semana, pausa_almoco_minutos"
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
  ]);

  const usaZonas =
    restaurante?.usa_zonas ?? true;

  const diasFuncionamento: number[] =
    restaurante?.dias_funcionamento ??
    [0, 1, 2, 3, 4, 5, 6];

  const zonas = zonasRaw ?? [];
  const disponibilidades =
    disponibilidadesRaw ?? [];

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

    const abertura =
      paraMinutos(
        horario.abertura
      );

    const fechamento =
      paraMinutos(
        horario.fechamento
      );

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

    const zona =
      zonas.find(
        (item) =>
          item.id ===
          zonaId
      );

    const capacidadeBase =
      zona
        ? Math.max(
            zona.capacidade_minima,
            1
          )
        : 1;

    const capacidadeAlvo =
      modoAltaDemanda
        ? Math.ceil(
            capacidadeBase *
              MULTIPLICADOR_COBERTURA_EVENTO
          )
        : capacidadeBase;

    /*
     * A capacidade é por período.
     * Por isso multiplicamos pelo número
     * de períodos da operação.
     */
    return (
      capacidadeAlvo *
      PERIODOS.length
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

    const capacidade =
      Math.max(
        capacidadeDiaZona(
          zonaId,
          dia
        ),
        1
      );

    let score =
      -(
        trabalhadores /
        capacidade
      ) * 100;

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
          a.id.localeCompare(
            b.id
          )
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
    foraPreferencia: boolean
  ) => {
    const horario =
      horarioDoTurno(
        funcionario,
        dia,
        periodo
      );

    const horas =
      horasPlanejadas(
        funcionario,
        dia,
        periodo
      );

    if (
      !horario ||
      horas <= 0
    ) {
      return false;
    }

    const inicio =
      Math.max(
        horario.abertura,
        Math.min(
          horario.inicioPeriodo,
          horario.fechamento -
            (
              horas * 60 +
              funcionario.pausaAlmocoMinutos
            )
        )
      );

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
        paraHora(inicio),

      hora_fim:
        paraHora(
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

    const chave =
      `${
        zonaId ??
        "sem-zona"
      }:${dia}:${periodo}`;

    coberturaNova.set(
      chave,
      (
        coberturaNova.get(
          chave
        ) ?? 0
      ) + 1
    );

    return true;
  };

  /*
   * ==========================================================
   * ESCOLHA DO FUNCIONÁRIO PARA CADA PERÍODO
   * ==========================================================
   */

  const escolherFuncionario = (
    zonaId: string | null,
    dia: number,
    periodo: Periodo,
    respeitarPreferencia: boolean
  ) =>
    funcionarios
      .filter(
        (funcionario) => {
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
          if (
            !diasTrabalhoPlanejados
              .get(
                funcionario.id
              )
              ?.has(dia)
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

          return !!horarioDoTurno(
            funcionario,
            dia,
            periodo
          );
        }
      )
      .sort(
        (a, b) => {
          const prefA =
            periodosPreferidos(
              a.id,
              dia
            ).includes(
              periodo
            )
              ? 1
              : 0;

          const prefB =
            periodosPreferidos(
              b.id,
              dia
            ).includes(
              periodo
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

          const horasA =
            horasRestantes.get(
              a.id
            ) ?? 0;

          const horasB =
            horasRestantes.get(
              b.id
            ) ?? 0;

          return (
            horasB -
              horasA ||
            a.id.localeCompare(
              b.id
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
   * COBERTURA
   * ==========================================================
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

      const capacidadeBase =
        zona
          ? Math.max(
              zona.capacidade_minima,
              1
            )
          : 1;

      const capacidadeAlvo =
        modoAltaDemanda
          ? Math.ceil(
              capacidadeBase *
                MULTIPLICADOR_COBERTURA_EVENTO
            )
          : capacidadeBase;

      /*
       * Primeiro tenta respeitar a preferência.
       * Depois pode sair dela se faltar cobertura.
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

          let faltam =
            Math.max(
              0,
              capacidadeAlvo -
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
                respeitarPreferencia
              );

            if (
              !candidato
            ) {
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

            if (
              !alocado
            ) {
              break;
            }

            faltam--;
          }

          if (
            !respeitarPreferencia
          ) {
            vagasSemCandidato +=
              faltam;
          }
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