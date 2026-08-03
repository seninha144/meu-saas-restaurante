import { createClient } from "@/lib/supabase/server";
import { toISODate } from "@/lib/dates";
import type { Periodo, Turno } from "@/types/dominio";

/** Busca a escala da semana; cria uma em rascunho se ainda não existir. */
export async function getOuCriarEscala(restauranteId: string, inicio: Date, fim: Date) {
  const supabase = await createClient();
  const semanaInicio = toISODate(inicio);

  const { data: existente } = await supabase
    .from("escalas")
    .select("id, status")
    .eq("restaurante_id", restauranteId)
    .eq("semana_inicio", semanaInicio)
    .maybeSingle();

  if (existente) return existente;

  const { data: nova, error } = await supabase
    .from("escalas")
    .insert({
      restaurante_id: restauranteId,
      semana_inicio: semanaInicio,
      semana_fim: toISODate(fim),
      status: "rascunho",
    })
    .select("id, status")
    .single();

  if (error || !nova) throw new Error(`Falha ao criar escala: ${error?.message}`);
  return nova;
}

export async function getTurnos(escalaId: string): Promise<Turno[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turnos")
    .select("id, funcionario_id, zona_id, dia_semana, periodo")
    .eq("escala_id", escalaId);

  if (error) throw new Error(`Falha ao buscar turnos: ${error.message}`);

  return (data ?? []).map((t) => ({
    id: t.id,
    funcionarioId: t.funcionario_id,
    zonaId: t.zona_id,
    periodo: t.periodo as Periodo,
    dia: t.dia_semana,
  }));
}

export async function getAlertasCobertura(restauranteId: string, escalaId: string) {
  const supabase = await createClient();

  const { data: zonas } = await supabase
    .from("zonas")
    .select("id, nome, capacidade_minima")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true)
    .gt("capacidade_minima", 0);

  if (!zonas || zonas.length === 0) return [];

  const { data: turnos } = await supabase
    .from("turnos")
    .select("zona_id, dia_semana, periodo")
    .eq("escala_id", escalaId);

  const alertas: { dia: number; periodo: Periodo; descricao: string; nivel: "critico" }[] = [];

  for (const zona of zonas) {
    for (let dia = 0; dia < 7; dia++) {
      for (const periodo of ["Manhã", "Tarde", "Noite", "Fechamento"] as Periodo[]) {
        const alocados = (turnos ?? []).filter(
          (t) => t.zona_id === zona.id && t.dia_semana === dia && t.periodo === periodo
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