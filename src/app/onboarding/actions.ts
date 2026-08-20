"use server";

import { redirect } from "next/navigation";
import { requireGerente } from "@/lib/auth/permissions";
import {
  lerPerfilOperacionalFormData,
  type PerfilOperacionalFormState,
} from "@/lib/perfil-operacional/perfil-operacional";
import { salvarPerfilOperacional } from "@/lib/perfil-operacional/persistencia";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = PerfilOperacionalFormState;

export async function salvarConfiguracaoOperacional(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const gerente = await requireGerente();
  const resultado = lerPerfilOperacionalFormData(formData);

  if ("erro" in resultado) return { erro: resultado.erro };

  const supabase = await createClient();
  const erro = await salvarPerfilOperacional(
    supabase,
    gerente.restauranteId,
    resultado.dados,
    true
  );

  if (erro) return { erro };

  redirect("/escalas");
}
