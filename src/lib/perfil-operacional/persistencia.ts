import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PerfilOperacionalPayload } from "./perfil-operacional";

export async function salvarPerfilOperacional(
  supabase: SupabaseClient<Database>,
  restauranteId: string,
  perfil: PerfilOperacionalPayload,
  concluirOnboarding: boolean
): Promise<string | null> {
  const { error: erroRestaurante } = await supabase
    .from("restaurantes")
    .update({
      dias_funcionamento: perfil.diasFuncionamento,
      cobertura_fds_prioritaria: perfil.coberturaFdsPrioritaria,
      permite_horario_repartido: perfil.permiteHorarioRepartido,
      permite_horas_extras: perfil.permiteHorasExtras,
      limite_horas_extras_semanais: perfil.permiteHorasExtras
        ? perfil.limiteHorasExtrasSemanais
        : 0,
      ...(concluirOnboarding ? { onboarding_concluido: true } : {}),
    })
    .eq("id", restauranteId);

  if (erroRestaurante) return `Falha ao salvar configuração: ${erroRestaurante.message}`;

  const { error: erroHorarios } = await supabase.from("horarios_funcionamento").upsert(
    perfil.horarios.map((horario) => ({ restaurante_id: restauranteId, ...horario })),
    { onConflict: "restaurante_id,dia_semana" }
  );
  if (erroHorarios) return `Falha ao salvar horários: ${erroHorarios.message}`;

  const { error: erroLimpezaMovimentos } = await supabase
    .from("movimento_operacional")
    .delete()
    .eq("restaurante_id", restauranteId);
  if (erroLimpezaMovimentos) return `Falha ao atualizar movimento operacional: ${erroLimpezaMovimentos.message}`;

  if (perfil.movimentos.length > 0) {
    const { error } = await supabase.from("movimento_operacional").insert(
      perfil.movimentos.map((movimento) => ({
        restaurante_id: restauranteId,
        ...movimento,
        periodo: movimento.periodo.trim(),
      }))
    );
    if (error) return `Falha ao salvar movimento operacional: ${error.message}`;
  }

  const { error: erroLimpezaNecessidades } = await supabase
    .from("necessidades_equipe")
    .delete()
    .eq("restaurante_id", restauranteId);
  if (erroLimpezaNecessidades) return `Falha ao atualizar necessidades de equipa: ${erroLimpezaNecessidades.message}`;

  if (perfil.necessidades.length > 0) {
    const { error } = await supabase.from("necessidades_equipe").insert(
      perfil.necessidades.map((necessidade) => ({
        restaurante_id: restauranteId,
        ...necessidade,
        periodo: necessidade.periodo.trim(),
        funcao: necessidade.funcao?.trim() || null,
      }))
    );
    if (error) return `Falha ao salvar necessidades de equipa: ${error.message}`;
  }

  return null;
}
