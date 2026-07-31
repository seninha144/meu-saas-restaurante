import { createClient } from "@/lib/supabase/server";
import type { Zona } from "@/types/dominio";

export async function getZonas(restauranteId: string): Promise<Zona[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zonas")
    .select("id, restaurante_id, nome, cor, ordem, capacidade_minima")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) throw new Error(`Falha ao buscar zonas: ${error.message}`);

  return (data ?? []).map((z) => ({
    id: z.id,
    restauranteId: z.restaurante_id,
    nome: z.nome,
    cor: z.cor,
    ordem: z.ordem,
    capacidadeMinima: z.capacidade_minima,
  }));
}

export async function getRestaurante(restauranteId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes")
    .select("id, nome, pais, moeda, usa_zonas")
    .eq("id", restauranteId)
    .single();

  if (error || !data) throw new Error(`Falha ao buscar restaurante: ${error?.message}`);

  return {
    id: data.id,
    nome: data.nome,
    pais: data.pais as "BR" | "PT",
    moeda: data.moeda as "BRL" | "EUR",
    usaZonas: data.usa_zonas as boolean,
  };
}