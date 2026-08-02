import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PapelUsuario, Usuario } from "@/types/dominio";

export async function getUsuarioAtual(): Promise<Usuario | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, nome_completo, email, papel, restaurante_id")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    nomeCompleto: data.nome_completo,
    email: data.email,
    papel: data.papel as PapelUsuario,
    restauranteId: data.restaurante_id,
  };
}

export async function requireSuperAdmin(): Promise<Usuario> {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");
  if (usuario.papel !== "super_admin") redirect("/escalas");
  return usuario;
}

/**
 * Restrito ao Gerente — e agora também barra quem passou do trial sem
 * assinatura ativa. Como TODA Server Action e página do Gerente já
 * chama requireGerente(), colocar a checagem aqui protege tudo de uma
 * vez, sem precisar espalhar `if (expirado)` por cada arquivo.
 *
 * Se o trial venceu e o status ainda está 'trial' (o cron ainda não
 * rodou, ou rodou e não pegou esse ainda), atualiza pra 'canceled' na
 * hora — barato, é um único restaurante, e evita depender só do cron
 * pra essa transição específica.
 */
export async function requireGerente(): Promise<Usuario & { restauranteId: string }> {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");
  if (usuario.papel !== "gerente" || !usuario.restauranteId) redirect("/login");

  const supabase = await createClient();
  const { data: restaurante } = await supabase
    .from("restaurantes")
    .select("status_assinatura, trial_ends_at")
    .eq("id", usuario.restauranteId)
    .single();

  if (restaurante) {
    const trialVencido = new Date(restaurante.trial_ends_at) < new Date();

    if (restaurante.status_assinatura === "trial" && trialVencido) {
      await supabase.from("restaurantes").update({ status_assinatura: "canceled" }).eq("id", usuario.restauranteId);
      redirect("/bloqueio");
    }

    if (restaurante.status_assinatura === "canceled") {
      redirect("/bloqueio");
    }
  }

  return usuario as Usuario & { restauranteId: string };
}