import { createClient } from "@/lib/supabase/server";
import type { DisponibilidadeDia, Funcionario, FrequenciaPagamento, Periodo } from "@/types/dominio";

const DURACAO_PADRAO_HORAS = 8;

export async function getFuncionarios(restauranteId: string, semanaInicioISO: string): Promise<Funcionario[]> {
  const supabase = await createClient();

  const { data: funcionariosRaw, error } = await supabase
    .from("funcionarios")
    .select(
      "id, restaurante_id, nome, cargo, zona_id, idade, genero, carga_horaria_semanal_max, folgas_obrigatorias_semana, ativo, valor_hora, frequencia_pagamento, pausa_almoco_minutos"
    )
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true);

  if (error) throw new Error(`Falha ao buscar funcionários: ${error.message}`);

  const { data: disponibilidadesRaw } = await supabase
    .from("disponibilidades")
    .select("funcionario_id, dia_semana, disponivel, periodo")
    .eq("restaurante_id", restauranteId);

  const { data: escala } = await supabase
    .from("escalas")
    .select("id")
    .eq("restaurante_id", restauranteId)
    .eq("semana_inicio", semanaInicioISO)
    .maybeSingle();

  const { data: turnosSemana } = escala
    ? await supabase.from("turnos").select("funcionario_id, dia_semana").eq("escala_id", escala.id)
    : { data: [] as { funcionario_id: string; dia_semana: number }[] };

  return (funcionariosRaw ?? []).map((f) => {
    const disponibilidade: DisponibilidadeDia[] = Array.from({ length: 7 }, (_, dia) => {
      const linhas = (disponibilidadesRaw ?? []).filter((d) => d.funcionario_id === f.id && d.dia_semana === dia);
      return {
        diaSemana: dia,
        disponivel: linhas.length === 0 ? true : linhas.some((l) => l.disponivel),
        periodosPreferidos: linhas.filter((l) => l.periodo).map((l) => l.periodo as Periodo),
      };
    });

    const turnosDoFuncionario = (turnosSemana ?? []).filter((t) => t.funcionario_id === f.id);
    const diasTrabalhados = new Set(turnosDoFuncionario.map((t) => t.dia_semana)).size;

    return {
      id: f.id,
      restauranteId: f.restaurante_id,
      nome: f.nome,
      cargo: f.cargo,
      zonaId: f.zona_id,
      iniciais: iniciaisDe(f.nome),
      idade: f.idade,
      genero: f.genero,
      horasSemana: diasTrabalhados * DURACAO_PADRAO_HORAS,
      cargaHorariaSemanalMax: Number(f.carga_horaria_semanal_max),
      folgasUsadas: 7 - diasTrabalhados,
      folgasObrigatorias: f.folgas_obrigatorias_semana,
      disponibilidade,
      ativo: f.ativo,
      valorHora: f.valor_hora === null ? null : Number(f.valor_hora),
      frequenciaPagamento: f.frequencia_pagamento as FrequenciaPagamento | null,
      pausaAlmocoMinutos: f.pausa_almoco_minutos ?? 30,
    };
  });
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeiras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return primeiras.join("");
}