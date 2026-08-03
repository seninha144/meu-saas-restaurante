"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { formatarDiaHeader } from "@/lib/dates";
import type { Alerta } from "@/types/dominio";

interface GapAlertaProps {
  alertas: Alerta[];
  dias: Date[];
}

export function GapAlerta({ alertas, dias }: GapAlertaProps) {
  const [expandido, setExpandido] = useState(false);

  if (alertas.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-[#E5484D]/25 bg-[#E5484D]/[0.06]">
      <button
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E5484D]/15">
          <AlertTriangle className="h-4 w-4 text-[#E5484D]" />
        </div>
        <p className="flex-1 text-sm font-semibold text-[#E5484D]">
          {alertas.length} turno{alertas.length > 1 ? "s" : ""} sem cobertura mínima
        </p>
        <span className="flex items-center gap-1 text-xs font-medium text-[#E5484D]/70">
          {expandido ? "Recolher" : "Ver detalhes"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandido ? "rotate-180" : ""}`} />
        </span>
      </button>

      {expandido && (
        <ul className="max-h-32 space-y-1 overflow-y-auto border-t border-[#E5484D]/15 px-4 py-3 pl-[52px]">
          {alertas.map((a, i) => {
            const { abrev, numero } = formatarDiaHeader(dias[a.dia]);
            return (
              <li key={i} className="text-sm text-white/60">
                <span className="mr-2 text-white/30">
                  {abrev} {numero} · {a.periodo}
                </span>
                {a.descricao}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}