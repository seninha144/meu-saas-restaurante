"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  erro?: string;
}

export async function entrar(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error || !data.user) {
    return { erro: "E-mail ou senha inválidos." };
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("papel")
    .eq("id", data.user.id)
    .single();

  redirect(usuario?.papel === "super_admin" ? "/gerentes" : "/escalas");
}