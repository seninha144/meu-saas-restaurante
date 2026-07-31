import { requireGerente } from "@/lib/auth/permissions";
import { getRestaurante, getZonas } from "@/lib/data/queries";
import { getFuncionarios } from "@/lib/data/funcionarios";
import { getOuCriarEscala, getTurnos, getAlertasCobertura } from "@/lib/data/escalas";
import { getSemana } from "@/lib/escalas/datas";

interface EscalasPageProps {
  searchParams: Promise<{ semana?: string }>;
}

export default async function EscalasPage({ searchParams }: EscalasPageProps) {
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
    <div className="min-h-screen bg-[#0b0d10] text-[#f1f0ec] font-sans">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">{restaurante.nome}</p>
            <h1 className="mt-1 font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
              Escala da semana
            </h1>
          </div>
        </header>

        <PainelEscalas
          zonas={zonas}
          usaZonas={restaurante.usaZonas}
          funcionarios={funcionarios}
          turnos={turnos}
          alertas={alertas}
          dias={dias}
          offsetAtual={offsetAtual}
        />
      </div>
    </div>
  );
}