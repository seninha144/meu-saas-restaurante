import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireGerente() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Busca o gerente vinculado ao usuário logado
  const { data: gerente } = await supabase
    .from("gerentes")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!gerente) {
    redirect("/login");
  }

  return gerente;
}