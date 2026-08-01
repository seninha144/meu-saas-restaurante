"use client";

import { useState, useRef, useEffect } from "react";
import { User, LogOut } from "lucide-react";
import { sair } from "@/lib/auth/actions";

interface UserMenuProps {
  nomeCompleto: string;
  email: string;
}

export function UserMenu({ nomeCompleto, email }: UserMenuProps) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fecharSeFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fecharSeFora);
    return () => document.removeEventListener("mousedown", fecharSeFora);
  }, []);

  const iniciais = nomeCompleto
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs font-bold text-white/80 transition hover:border-white/20 hover:bg-white/[0.08]"
      >
        {iniciais || <User className="h-4 w-4" />}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 w-56 rounded-xl border border-white/10 bg-[#111318] p-1.5 shadow-xl">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-white/90">{nomeCompleto}</p>
            <p className="truncate text-xs text-white/40">{email}</p>
          </div>
          <div className="my-1 h-px bg-white/[0.06]" />
          <form action={sair}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}