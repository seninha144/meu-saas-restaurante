import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PapelUsuario, Usuario } from "@/types/dominio";

/** Busca o usuário logado (linha da tabela `usuarios`), já mapeado pra camelCase. */
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

/** Restrito ao Super Admin — redireciona qualquer outro papel. */
export async function requireSuperAdmin(): Promise<Usuario> {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");
  if (usuario.papel !== "super_admin") redirect("/escalas");
  return usuario;
}

/**
 * Restrito ao Gerente. Valida DUAS coisas, não só "existe usuário":
 * papel === 'gerente' E restauranteId presente. É essa segunda
 * checagem que faltou na versão que reescreveu este arquivo — sem
 * ela, qualquer usuário sem restaurante vinculado passava direto e
 * só quebrava depois, no insert.
 */
export async function requireGerente(): Promise<Usuario & { restauranteId: string }> {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");
  if (usuario.papel !== "gerente" || !usuario.restauranteId) redirect("/login");
  return usuario as Usuario & { restauranteId: string };
}