import { requireGerente } from "@/lib/auth/permissions";
import { getRestaurante, getZonas } from "@/lib/data/queries";
import { getFuncionarios } from "@/lib/data/funcionarios";
import { getOuCriarEscala, getTurnos, getAlertasCobertura } from "@/lib/data/escalas";
import { getSemana } from "@/lib/escalas/datas";
import { PainelEscalas } from "@/components/escalas/PainelEscalas";

interface EscalasPageProps {
  searchParams: Promise<{ semana?: string }>;
}

export default async function EscalasPage({ searchParams }: EscalasPageProps) {
  // requireGerente() já garante papel === 'gerente' E restauranteId presente
  // (redireciona pro /login se não), então daqui pra baixo é seguro usar
  // gerente.restauranteId direto — sem gambiarra de snake_case.
  const gerente = await requireGerente();

  const { semana } = await searchParams;
  const offsetAtual = Number.isFinite(Number(semana)) ? Number(semana ?? 0) : 0;

  const { inicio, fim, dias } = getSemana(offsetAtual);
  const semanaInicioISO = inicio.toISOString().slice(0, 10);

  const [restaurante, zonas, funcionarios] = await Promise.all([
    getRestaurante(gerente.restauranteId),
    getZonas(gerente.restauranteId),
    getFuncionarios(gerente.restauranteId, semanaInicioISO),
  ]);

  const escala = await getOuCriarEscala(gerente.restauranteId, inicio, fim);
  const [turnos, alertas] = await Promise.all([
    getTurnos(escala.id),
    getAlertasCobertura(gerente.restauranteId, escala.id),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10">
      <h1 className="font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
        Escala da semana
      </h1>

      <PainelEscalas
        escalaId={escala.id}
        zonas={zonas}
        usaZonas={restaurante.usaZonas}
        funcionarios={funcionarios}
        turnos={turnos}
        alertas={alertas}
        dias={dias}
        offsetAtual={offsetAtual}
      />
    </div>
  );
}