import { createClient } from "@/lib/supabase/server";
import { horasEfetivasDoTurno } from "@/lib/horas";
import type {
  DisponibilidadeDia,
  Funcionario,
  FrequenciaPagamento,
  PeriodoDisponibilidade,
  Genero,
} from "@/types/dominio";

function normalizarGenero(valor: string | null): Genero | null {
  if (
    valor === "masculino" ||
    valor === "feminino" ||
    valor === "outro" ||
    valor === "prefiro_nao_informar"
  ) {
    return valor;
  }

  return null;
}

function duracaoHoras(
  horaInicio: string | null,
  horaFim: string | null,
  pausaAlmocoMinutos: number
): number {
  if (!horaInicio || !horaFim) {
    return 8;
  }

  return horasEfetivasDoTurno(
    horaInicio,
    horaFim,
    pausaAlmocoMinutos
  );
}

export async function getFuncionarios(
  restauranteId: string,
  semanaInicioISO: string
): Promise<Funcionario[]> {
  const supabase = await createClient();

  const {
    data: funcionariosRaw,
    error,
  } = await supabase
    .from("funcionarios")
    .select(
      "id, restaurante_id, nome, cargo, zona_id, idade, genero, carga_horaria_semanal_max, folgas_obrigatorias_semana, ativo, valor_hora, frequencia_pagamento, pausa_almoco_minutos, pode_abertura, pode_fechamento, aceita_horario_repartido, aceita_horas_extras, eh_gerencia"
    )
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true);

  if (error) {
    throw new Error(
      `Falha ao buscar funcionários: ${error.message}`
    );
  }

  const {
    data: disponibilidadesRaw,
  } = await supabase
    .from("disponibilidades")
    .select(
      "funcionario_id, dia_semana, disponivel, periodo"
    )
    .eq("restaurante_id", restauranteId);

  const { data: escala } = await supabase
    .from("escalas")
    .select("id")
    .eq("restaurante_id", restauranteId)
    .eq("semana_inicio", semanaInicioISO)
    .maybeSingle();

  const { data: turnosSemana } = escala
    ? await supabase
        .from("turnos")
        .select(
          "funcionario_id, dia_semana, hora_inicio, hora_fim"
        )
        .eq("escala_id", escala.id)
    : {
        data: [] as {
          funcionario_id: string;
          dia_semana: number;
          hora_inicio: string | null;
          hora_fim: string | null;
        }[],
      };

  return (funcionariosRaw ?? []).map((f) => {
    const disponibilidade: DisponibilidadeDia[] =
      Array.from(
        { length: 7 },
        (_, dia) => {
          const linhas =
            (disponibilidadesRaw ?? []).filter(
              (d) =>
                d.funcionario_id === f.id &&
                d.dia_semana === dia
            );

          const periodosPreferidos: PeriodoDisponibilidade[] =
            linhas
              .filter(
                (linha) =>
                  linha.disponivel &&
                  linha.periodo !== null
              )
              .map((linha) => linha.periodo)
              .filter(
                (
                  periodo
                ): periodo is PeriodoDisponibilidade =>
                  periodo === "Manhã" ||
                  periodo === "Tarde" ||
                  periodo === "Fechamento" ||
                  periodo === "Total"
              );

          return {
            diaSemana: dia,
            disponivel:
              linhas.length === 0
                ? true
                : linhas.some(
                    (linha) => linha.disponivel
                  ),
            periodosPreferidos,
          };
        }
      );

    const turnosDoFuncionario =
      (turnosSemana ?? []).filter(
        (t) => t.funcionario_id === f.id
      );

    const diasTrabalhados = new Set(
      turnosDoFuncionario.map(
        (t) => t.dia_semana
      )
    ).size;

    const horasSemana =
      turnosDoFuncionario.reduce(
        (soma, t) =>
          soma +
          duracaoHoras(
            t.hora_inicio?.slice(0, 5) ?? null,
            t.hora_fim?.slice(0, 5) ?? null,
            f.pausa_almoco_minutos ?? 30
          ),
        0
      );

    return {
      id: f.id,
      restauranteId: f.restaurante_id,
      nome: f.nome,
      cargo: f.cargo,
      zonaId: f.zona_id,
      iniciais: iniciaisDe(f.nome),
      idade: f.idade,
      genero: normalizarGenero(f.genero),
      horasSemana:
        Math.round(horasSemana * 100) / 100,
      cargaHorariaSemanalMax:
        Number(f.carga_horaria_semanal_max),
      folgasUsadas: 7 - diasTrabalhados,
      folgasObrigatorias:
        f.folgas_obrigatorias_semana,
      disponibilidade,
      ativo: f.ativo,
      valorHora:
        f.valor_hora === null
          ? null
          : Number(f.valor_hora),
      frequenciaPagamento:
        f.frequencia_pagamento as
          | FrequenciaPagamento
          | null,
      pausaAlmocoMinutos:
        f.pausa_almoco_minutos ?? 30,
      podeAbertura: f.pode_abertura ?? true,
      podeFechamento: f.pode_fechamento ?? true,
      aceitaHorarioRepartido: f.aceita_horario_repartido ?? false,
      aceitaHorasExtras: f.aceita_horas_extras ?? false,
      ehGerencia:
        f.eh_gerencia ?? false,
    };
  });
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);

  const primeiras = partes
    .slice(0, 2)
    .map(
      (p) => p[0]?.toUpperCase() ?? ""
    );

  return primeiras.join("");
}
