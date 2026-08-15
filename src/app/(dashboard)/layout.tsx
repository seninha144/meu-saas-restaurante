import { redirect } from "next/navigation";
import { requireGerente } from "@/lib/auth/permissions";
import { getRestaurante } from "@/lib/data/queries";
import { getNotificacoes } from "@/lib/data/notificacoes";
import { UserMenu } from "@/components/layout/UserMenu";
import { Sidebar } from "@/components/layout/Sidebar";
import { NotificacoesSino } from "@/components/layout/NotificacoesSino";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const gerente = await requireGerente();
  const restaurante = await getRestaurante(gerente.restauranteId);
  if (!restaurante.onboardingConcluido) redirect("/onboarding");

  const notificacoes = await getNotificacoes(gerente.restauranteId);

  return (
    <div className="flex min-h-screen bg-[#0b0d10] font-sans text-[#f1f0ec]">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <div className="border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 pl-16 sm:px-6 lg:pl-6">
            <p className="text-sm font-medium text-white/70">{restaurante.nome}</p>
            <div className="flex items-center gap-2">
              <NotificacoesSino notificacoes={notificacoes} />
              <UserMenu nomeCompleto={gerente.nomeCompleto} email={gerente.email} />
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}