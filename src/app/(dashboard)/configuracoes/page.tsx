import { requireGerente } from "@/lib/auth/permissions";
import { getRestaurante } from "@/lib/data/queries";
import { ToggleConfig } from "./ToggleConfig";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const gerente = await requireGerente();
  const restaurante = await getRestaurante(gerente.restauranteId);

  return (
    <div className="mx-auto max-w-[700px] px-4 py-6 sm:px-6 lg:px-10">
      <h1 className="font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
        Configurações
      </h1>

      <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <ToggleConfig ativoInicial={restaurante.pontoAutomatico} />
      </div>
    </div>
  );
}