"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export interface ZonaFormState {
  erro?: string;
  sucesso?: boolean;
}

export async function salvarZona(_prevState: ZonaFormState, formData: FormData): Promise<ZonaFormState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const cor = String(formData.get("cor") ?? "#6B8CAE");
  const capacidadeMinima = Number(formData.get("capacidadeMinima") ?? 0);

  if (!nome) return { erro: "Dê um nome para a zona." };

  const payload = {
    restaurante_id: gerente.restauranteId,
    nome,
    cor,
    capacidade_minima: capacidadeMinima,
  };

  const { error } = id
    ? await supabase.from("zonas").update(payload).eq("id", id)
    : await supabase.from("zonas").insert(payload);

  if (error) return { erro: `Falha ao salvar zona: ${error.message}` };

  revalidatePath("/escalas");
  return { sucesso: true };
}

/** Remoção lógica — preserva o histórico de turnos já lançados nessa zona. */
export async function removerZona(zonaId: string): Promise<void> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  await supabase
    .from("zonas")
    .update({ ativo: false })
    .eq("id", zonaId)
    .eq("restaurante_id", gerente.restauranteId);

  revalidatePath("/escalas");
}

/** Liga/desliga o modo "sem zonas" do restaurante (operação linear). */
export async function definirUsaZonas(usaZonas: boolean): Promise<void> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  await supabase.from("restaurantes").update({ usa_zonas: usaZonas }).eq("id", gerente.restauranteId);

  revalidatePath("/escalas");
}