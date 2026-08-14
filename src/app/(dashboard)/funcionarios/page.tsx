import { requireGerente } from "@/lib/auth/permissions";
import { getFuncionarios } from "@/lib/data/funcionarios";
import { getZonas, getRestaurante } from "@/lib/data/queries";
import { getSemana, toISODate } from "@/lib/dates";
import { FuncionariosLista } from "@/components/funcionarios/FuncionariosLista";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  const gerente = await requireGerente();
  const { inicio } = getSemana(0);

  const [funcionarios, zonas, restaurante] = await Promise.all([
    getFuncionarios(gerente.restauranteId, toISODate(inicio)),
    getZonas(gerente.restauranteId),
    getRestaurante(gerente.restauranteId),
  ]);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
            Funcionários
          </h1>
          <p className="mt-1 text-sm text-white/40">
            {funcionarios.length} de {restaurante.maxFuncionarios} colaboradores do seu plano
          </p>
        </div>
      </div>

      <FuncionariosLista
        funcionarios={funcionarios}
        zonas={zonas}
        usaZonas={restaurante.usaZonas}
        diasFuncionamento={restaurante.diasFuncionamento}
      />
    </div>
  );
}