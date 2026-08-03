import { redirect } from "next/navigation";
import { requireGerente } from "@/lib/auth/permissions";
import { getRestaurante } from "@/lib/data/queries";
import { UserMenu } from "@/components/layout/UserMenu";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const gerente = await requireGerente();
  const restaurante = await getRestaurante(gerente.restauranteId);

  // Portão do onboarding: fica aqui (não em requireGerente) porque só
  // deve barrar a VISUALIZAÇÃO do painel, não toda Server Action —
  // e porque /onboarding em si não passa por este layout, evitando loop.
  if (!restaurante.onboardingConcluido) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-[#0b0d10] font-sans text-[#f1f0ec]">
      <div className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
          <p className="text-sm font-medium text-white/70">{restaurante.nome}</p>
          <UserMenu nomeCompleto={gerente.nomeCompleto} email={gerente.email} />
        </div>
      </div>
      {children}
    </div>
  );
}