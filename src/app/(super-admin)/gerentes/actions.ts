"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CriarGerenteState {
  erro?: string;
  sucesso?: boolean;
}

/**
 * Só o Super Admin chega aqui (requireSuperAdmin barra qualquer outro
 * papel). Cria o restaurante, a conta em auth.users via Admin API
 * (só possível com a service_role key) e a linha correspondente em
 * `usuarios` com papel 'gerente' — tudo em sequência, com rollback
 * manual se algum passo falhar no meio.
 */
export async function criarGerente(
  _prevState: CriarGerenteState,
  formData: FormData
): Promise<CriarGerenteState> {
  await requireSuperAdmin();

  const nomeRestaurante = String(formData.get("nomeRestaurante") ?? "").trim();
  const pais = String(formData.get("pais") ?? "BR") as "BR" | "PT";
  const nomeGerente = String(formData.get("nomeGerente") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!nomeRestaurante || !nomeGerente || !email || senha.length < 8) {
    return { erro: "Preencha todos os campos (senha com no mínimo 8 caracteres)." };
  }

  const admin = createAdminClient();

  const { data: restaurante, error: erroRestaurante } = await admin
    .from("restaurantes")
    .insert({ nome: nomeRestaurante, pais, moeda: pais === "PT" ? "EUR" : "BRL" })
    .select("id")
    .single();

  if (erroRestaurante || !restaurante) {
    return { erro: `Falha ao criar restaurante: ${erroRestaurante?.message}` };
  }

  const { data: authUser, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !authUser.user) {
    await admin.from("restaurantes").delete().eq("id", restaurante.id); // rollback
    return { erro: `Falha ao criar conta de acesso: ${erroAuth?.message}` };
  }

  const { error: erroUsuario } = await admin.from("usuarios").insert({
    id: authUser.user.id,
    restaurante_id: restaurante.id,
    nome_completo: nomeGerente,
    email,
    papel: "gerente",
  });

  if (erroUsuario) {
    await admin.auth.admin.deleteUser(authUser.user.id); // rollback
    await admin.from("restaurantes").delete().eq("id", restaurante.id);
    return { erro: `Falha ao vincular usuário: ${erroUsuario.message}` };
  }

  revalidatePath("/gerentes");
  return { sucesso: true };
}