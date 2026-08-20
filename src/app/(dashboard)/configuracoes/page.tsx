import { requireGerente } from "@/lib/auth/permissions";
import { getConfiguracaoOnboarding } from "@/lib/data/onboarding";
import { getCargosExistentes, getRestaurante, getZonas } from "@/lib/data/queries";
import { PerfilOperacionalForm } from "@/components/onboarding/OnboardingForm";
import { salvarConfiguracaoOperacional } from "./actions";
import { ToggleConfig } from "./ToggleConfig";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const gerente = await requireGerente();
  const [restaurante, configuracao, zonas, cargosExistentes] = await Promise.all([
    getRestaurante(gerente.restauranteId),
    getConfiguracaoOnboarding(gerente.restauranteId),
    getZonas(gerente.restauranteId),
    getCargosExistentes(gerente.restauranteId),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-10">
      <h1 className="font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
        Configurações
      </h1>

      <div className="mt-6">
        <PerfilOperacionalForm
          zonas={zonas}
          cargosExistentes={cargosExistentes}
          horariosExistentes={configuracao.horarios}
          coberturaFdsExistente={configuracao.coberturaFdsPrioritaria}
          permiteHorarioRepartidoExistente={configuracao.permiteHorarioRepartido}
          permiteHorasExtrasExistente={configuracao.permiteHorasExtras}
          limiteHorasExtrasExistente={configuracao.limiteHorasExtrasSemanais}
          movimentosExistentes={configuracao.movimentos}
          necessidadesExistentes={configuracao.necessidades}
          action={salvarConfiguracaoOperacional}
          contexto="configuracoes"
        />
      </div>

      <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <ToggleConfig ativoInicial={restaurante.pontoAutomatico} />
      </div>
    </div>
  );
}
