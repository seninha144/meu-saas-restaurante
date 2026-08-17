"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface RegistroState {
  erro?: string;
  sucesso?: boolean;
}

const DIAS_TRIAL = 14;

export async function registrarRestaurante(
  _prevState: RegistroState,
  formData: FormData
): Promise<RegistroState> {
  // Passo 1
  const nomeGerente = String(formData.get("nomeGerente") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const nomeRestaurante = String(formData.get("nomeRestaurante") ?? "").trim();

  // Passo 2
  const totalFuncionarios = Number(formData.get("totalFuncionarios") ?? 10);
  const valorHoraPadraoRaw = String(formData.get("valorHoraPadrao") ?? "").trim();
  const valorHoraPadrao = Number(valorHoraPadraoRaw.replace(",", "."));

  // Passo 3
  const frequenciaPagamentoPadrao = String(formData.get("frequenciaPagamentoPadrao") ?? "mes");

  if (!nomeGerente || !email || senha.length < 8 || !nomeRestaurante) {
    return { erro: "Preencha todos os campos do passo 1 (senha com no mínimo 8 caracteres)." };
  }
  if (!valorHoraPadraoRaw || !Number.isFinite(valorHoraPadrao) || valorHoraPadrao < 0) {
    return { erro: "Informe um valor/hora padrão válido." };
  }

  const admin = createAdminClient();

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + DIAS_TRIAL);

  const { data: restaurante, error: erroRestaurante } = await admin
    .from("restaurantes")
    .insert({
      nome: nomeRestaurante,
      pais: "PT",
      moeda: "EUR",
      plano: "trial",
      max_funcionarios: Math.max(totalFuncionarios, 1),
      status_assinatura: "trial",
      trial_ends_at: trialEndsAt.toISOString(),
      valor_hora_padrao: valorHoraPadrao,
      frequencia_pagamento_padrao: frequenciaPagamentoPadrao,
    })
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
    await admin.from("restaurantes").delete().eq("id", restaurante.id);
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
    await admin.auth.admin.deleteUser(authUser.user.id);
    await admin.from("restaurantes").delete().eq("id", restaurante.id);
    return { erro: `Falha ao vincular usuário: ${erroUsuario.message}` };
  }

  // Loga a pessoa automaticamente — ela acabou de criar a conta, não
  // faz sentido pedir login de novo logo em seguida.
  const supabase = await createClient();
  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroLogin) {
    // conta criada com sucesso, só o auto-login falhou — manda pro
    // login manual em vez de reportar como falha de cadastro.
    return { sucesso: true };
  }

  return { sucesso: true };
}
