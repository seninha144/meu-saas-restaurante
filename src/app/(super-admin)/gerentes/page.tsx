import { requireSuperAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NovoGerenteForm } from "./NovoGerenteForm";

export default async function GerentesPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: restaurantes } = await supabase
    .from("restaurantes")
    .select("id, nome, pais, usuarios(nome_completo, email)")
    .order("criado_em", { ascending: false });

  return (
    <div className="min-h-screen bg-[#0b0d10] px-4 py-10 font-sans text-[#f1f0ec] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">Super Admin</p>
        <h1 className="mt-1 font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight">
          Restaurantes e Gerentes
        </h1>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <NovoGerenteForm />
        </div>

        <div className="mt-8 space-y-2">
          {restaurantes?.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{r.nome}</p>
                <p className="text-xs text-white/40">{r.pais}</p>
              </div>
              <p className="text-xs text-white/50">
                {/* usuarios vem como array pela relação 1:N tipada — pegamos o primeiro gerente */}
                {(r as any).usuarios?.[0]?.email ?? "sem gerente vinculado"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}