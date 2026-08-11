import { createClient } from "@/lib/supabase/server";
import type { HorarioFuncionamento } from "@/types/dominio";

export async function getHorarios(restauranteId: string): Promise<HorarioFuncionamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("horarios_funcionamento")
    .select("dia_semana, fechado, hora_abertura, hora_fechamento")
    .eq("restaurante_id", restauranteId)
    .order("dia_semana", { ascending: true });

  if (error) throw new Error(`Falha ao buscar horários: ${error.message}`);

  // Se o restaurante ainda não passou pelo onboarding operacional (ou
  // um dia específico nunca foi salvo), cai num padrão razoável em vez
  // de quebrar a agenda por falta de linha.
  const porDia = new Map((data ?? []).map((h) => [h.dia_semana, h]));

  return Array.from({ length: 7 }, (_, dia) => {
    const h = porDia.get(dia);
    return {
      diaSemana: dia,
      fechado: h?.fechado ?? false,
      horaAbertura: h?.hora_abertura?.slice(0, 5) ?? "09:00",
      horaFechamento: h?.hora_fechamento?.slice(0, 5) ?? "23:00",
    };
  });
}