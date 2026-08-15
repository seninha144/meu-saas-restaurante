"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export async function definirPontoAutomatico(ativo: boolean): Promise<void> {
  const gerente = await requireGerente();
  const supabase = await createClient();
  await supabase.from("restaurantes").update({ ponto_automatico: ativo }).eq("id", gerente.restauranteId);
  revalidatePath("/configuracoes");
}