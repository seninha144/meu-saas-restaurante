import { AlertTriangle } from "lucide-react";
import { formatarDiaHeader } from "@/lib/dates";
import type { Alerta } from "@/types/dominio";

interface GapAlertaProps {
  alertas: Alerta[];
  dias: Date[]; // os 7 dias da semana exibida, para rotular cada alerta
}

export function GapAlerta({ alertas, dias }: GapAlertaProps) {
  if (alertas.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-[#E5484D]/25 bg-[#E5484D]/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E5484D]/15">
          <AlertTriangle className="h-4 w-4 text-[#E5484D]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#E5484D]">
            {alertas.length} turno{alertas.length > 1 ? "s" : ""} sem cobertura mínima
          </p>
          <ul className="mt-1.5 space-y-1">
            {alertas.map((a, i) => {
              const { abrev, numero } = formatarDiaHeader(dias[a.dia]);
              return (
                <li key={i} className="text-sm text-white/60">
                  <span className="mr-2 text-white/30">
                    {abrev} {numero} · {a.periodo}
                  </span>
                  Atenção: {a.descricao}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}