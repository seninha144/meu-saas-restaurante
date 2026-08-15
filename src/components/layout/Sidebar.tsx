"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Users, Wallet, Settings, Menu, X } from "lucide-react";

const ITENS = [
  { href: "/escalas", label: "Escalas", icon: CalendarDays },
  { href: "/funcionarios", label: "Funcionários", icon: Users },
  { href: "/pagamentos", label: "Pagamentos", icon: Wallet },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="fixed left-4 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#111318] text-white/70 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {aberto && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setAberto(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 shrink-0 border-r border-white/[0.06] bg-[#0b0d10] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <p className="font-[Space_Grotesk,system-ui,sans-serif] text-sm font-semibold tracking-tight text-white/90">Painel</p>
          <button onClick={() => setAberto(false)} className="text-white/40 hover:text-white/80 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-0.5 px-2">
          {ITENS.map(({ href, label, icon: Icon }) => {
            const ativo = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setAberto(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  ativo ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/[0.05] hover:text-white/80"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}