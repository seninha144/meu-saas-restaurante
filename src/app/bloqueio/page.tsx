import { redirect } from "next/navigation";
import { getUsuarioAtual } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function BloqueioPage() {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");

  const supabase = await createClient();
  const { data: restaurante } = await supabase
    .from("restaurantes")
    .select("nome, status_assinatura")
    .eq("id", usuario.restauranteId)
    .single();

  // se por algum motivo a assinatura já está ativa, não faz sentido
  // travar aqui — manda de volta pro painel.
  if (restaurante?.status_assinatura === "active") redirect("/escalas");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4 font-sans text-[#f1f0ec]">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">{restaurante?.nome}</p>
        <h1 className="mt-2 font-[Space_Grotesk,system-ui,sans-serif] text-xl font-semibold">
          Seu período de teste terminou
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Pra continuar gerenciando escalas e a equipe, escolha um plano. Seus dados continuam guardados —
          nada é perdido enquanto a assinatura está pausada.
        </p>
        <button className="mt-6 w-full rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition hover:brightness-105">
          Ver planos
        </button>
      </div>
    </div>
  );
}