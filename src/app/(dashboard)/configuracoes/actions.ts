"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import {
  lerPerfilOperacionalFormData,
  type PerfilOperacionalFormState,
} from "@/lib/perfil-operacional/perfil-operacional";
import { salvarPerfilOperacional } from "@/lib/perfil-operacional/persistencia";
import { createClient } from "@/lib/supabase/server";

export async function salvarConfiguracaoOperacional(
  _prevState: PerfilOperacionalFormState,
  formData: FormData
): Promise<PerfilOperacionalFormState> {
  const gerente = await requireGerente();
  const resultado = lerPerfilOperacionalFormData(formData);

  if ("erro" in resultado) return { erro: resultado.erro };

  const supabase = await createClient();
  const erro = await salvarPerfilOperacional(
    supabase,
    gerente.restauranteId,
    resultado.dados,
    false
  );

  if (erro) return { erro };

  revalidatePath("/configuracoes");
  return { sucesso: true };
}

export async function definirPontoAutomatico(ativo: boolean): Promise<void> {
  const gerente = await requireGerente();
  const supabase = await createClient();
  await supabase.from("restaurantes").update({ ponto_automatico: ativo }).eq("id", gerente.restauranteId);
  revalidatePath("/configuracoes");
}
