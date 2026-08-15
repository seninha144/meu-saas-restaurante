"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, Info } from "lucide-react";
import type { Notificacao } from "@/types/dominio";

export function NotificacoesSino({ notificacoes }: { notificacoes: Notificacao[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fecharSeFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fecharSeFora);
    return () => document.removeEventListener("mousedown", fecharSeFora);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20"
      >
        <Bell className="h-4 w-4" />
        {notificacoes.length > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#E5484D]" />
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 w-72 rounded-xl border border-white/10 bg-[#111318] p-1.5 shadow-xl">
          {notificacoes.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-xs text-white/30">Tudo em dia por aqui.</p>
          ) : (
            notificacoes.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => setAberto(false)}
                className="flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-white/[0.06]"
              >
                {n.nivel === "atencao" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E5484D]" />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3EC6B9]" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/85">{n.titulo}</p>
                  <p className="truncate text-[11px] text-white/40">{n.descricao}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}