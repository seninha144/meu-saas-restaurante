import { redirect } from "next/navigation";
import { requireGerente } from "@/lib/auth/permissions";
import { getRestaurante } from "@/lib/data/queries";
import { UserMenu } from "@/components/layout/UserMenu";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const gerente = await requireGerente();
  const restaurante = await getRestaurante(gerente.restauranteId);

  if (!restaurante.onboardingConcluido) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen bg-[#0b0d10] font-sans text-[#f1f0ec]">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <div className="border-b border-white/[0.06]">
          <div className="flex items-center justify-between px-4 py-3 pl-16 sm:px-6 lg:pl-6">
            <p className="text-sm font-medium text-white/70">{restaurante.nome}</p>
            <UserMenu nomeCompleto={gerente.nomeCompleto} email={gerente.email} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}