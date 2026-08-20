import { requireGerente } from "@/lib/auth/permissions";
import { getZonas, getCargosExistentes } from "@/lib/data/queries";
import { getConfiguracaoOnboarding } from "@/lib/data/onboarding";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const gerente = await requireGerente();

  const [zonas, cargosExistentes, configuracao] = await Promise.all([
    getZonas(gerente.restauranteId),
    getCargosExistentes(gerente.restauranteId),
    getConfiguracaoOnboarding(gerente.restauranteId),
  ]);

  return (
    <OnboardingForm
      zonas={zonas}
      cargosExistentes={cargosExistentes}
      horariosExistentes={configuracao.horarios}
      coberturaFdsExistente={configuracao.coberturaFdsPrioritaria}
      permiteHorarioRepartidoExistente={configuracao.permiteHorarioRepartido}
      permiteHorasExtrasExistente={configuracao.permiteHorasExtras}
      limiteHorasExtrasExistente={configuracao.limiteHorasExtrasSemanais}
      movimentosExistentes={configuracao.movimentos}
      necessidadesExistentes={configuracao.necessidades}
    />
  );
}
