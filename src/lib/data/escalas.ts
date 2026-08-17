import { createClient } from "@/lib/supabase/server";
import { toISODate } from "@/lib/dates";
import type { Periodo, Turno } from "@/types/dominio";

export async function getOuCriarEscala(
  restauranteId: string,
  inicio: Date,
  fim: Date
) {
  const supabase = await createClient();
  const semanaInicio = toISODate(inicio);
  const semanaFim = toISODate(fim);

  // O upsert evita condição de corrida entre "verificar se existe"
  // e "criar a escala". A constraint única do banco garante
  // que só exista uma escala por restaurante e semana.
  const { data: escala, error } = await supabase
    .from("escalas")
    .upsert(
      {
        restaurante_id: restauranteId,
        semana_inicio: semanaInicio,
        semana_fim: semanaFim,
        status: "rascunho",
      },
      {
        onConflict: "restaurante_id,semana_inicio",
        ignoreDuplicates: true,
      }
    )
    .select("id, status")
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao obter ou criar escala: ${error.message}`);
  }

  // Quando ignoreDuplicates=true e a escala já existia,
  // o PostgreSQL pode não devolver uma linha no upsert.
  // Nesse caso, buscamos a escala existente.
  if (!escala) {
    const { data: existente, error: erroExistente } = await supabase
      .from("escalas")
      .select("id, status")
      .eq("restaurante_id", restauranteId)
      .eq("semana_inicio", semanaInicio)
      .maybeSingle();

    if (erroExistente || !existente) {
      throw new Error(
        `Falha ao obter escala existente: ${erroExistente?.message ?? "Escala não encontrada."}`
      );
    }

    return existente;
  }

  return escala;
}

export async function getTurnos(escalaId: string): Promise<Turno[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("turnos")
    .select(
      "id, funcionario_id, zona_id, dia_semana, periodo, hora_inicio, hora_fim, fora_preferencia"
    )
    .eq("escala_id", escalaId);

  if (error) {
    throw new Error(`Falha ao buscar turnos: ${error.message}`);
  }

  return (data ?? []).map((t) => ({
    id: t.id,
    funcionarioId: t.funcionario_id,
    zonaId: t.zona_id,
    periodo: t.periodo as Periodo,
    dia: t.dia_semana,
    horaInicio: t.hora_inicio
      ? String(t.hora_inicio).slice(0, 5)
      : null,
    horaFim: t.hora_fim
      ? String(t.hora_fim).slice(0, 5)
      : null,
    foraPreferencia: t.fora_preferencia ?? false,
  }));
}

export async function getAlertasCobertura(
  restauranteId: string,
  escalaId: string
) {
  const supabase = await createClient();

  const { data: zonas, error: erroZonas } = await supabase
    .from("zonas")
    .select("id, nome, capacidade_minima")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true)
    .gt("capacidade_minima", 0);

  if (erroZonas) {
    throw new Error(
      `Falha ao buscar zonas para alertas: ${erroZonas.message}`
    );
  }

  if (!zonas || zonas.length === 0) {
    return [];
  }

  const { data: turnos, error: erroTurnos } = await supabase
    .from("turnos")
    .select("zona_id, dia_semana, periodo")
    .eq("escala_id", escalaId);

  if (erroTurnos) {
    throw new Error(
      `Falha ao buscar turnos para alertas: ${erroTurnos.message}`
    );
  }

  const alertas: {
    dia: number;
    periodo: Periodo;
    descricao: string;
    nivel: "critico";
  }[] = [];

  for (const zona of zonas) {
    for (let dia = 0; dia < 7; dia++) {
      for (const periodo of [
        "Manhã",
        "Tarde",
        "Noite",
        "Fechamento",
      ] as Periodo[]) {
        const alocados = (turnos ?? []).filter(
          (t) =>
            t.zona_id === zona.id &&
            t.dia_semana === dia &&
            t.periodo === periodo
        ).length;

        if (alocados < zona.capacidade_minima) {
          const faltam = zona.capacidade_minima - alocados;

          alertas.push({
            dia,
            periodo,
            descricao: `${zona.nome} no período da ${periodo.toLowerCase()} precisa de +${faltam} colaborador(es)`,
            nivel: "critico",
          });
        }
      }
    }
  }

  return alertas;
}