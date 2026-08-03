"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatarIntervalo } from "@/lib/dates";

interface SeletorSemanaProps {
  inicio: Date;
  fim: Date;
  offsetAtual: number;
}

export function SeletorSemana({ inicio, fim, offsetAtual }: SeletorSemanaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function irPara(offset: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (offset === 0) {
      params.delete("semana");
    } else {
      params.set("semana", String(offset));
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="mt-3 flex items-center justify-between">
      <p className="text-sm text-white/40">{formatarIntervalo(inicio, fim)}</p>
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
        <button
          onClick={() => irPara(offsetAtual - 1)}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Semana anterior
        </button>
        <button
          onClick={() => irPara(0)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            offsetAtual === 0 ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          Atual
        </button>
        <button
          onClick={() => irPara(offsetAtual + 1)}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
        >
          Próxima semana
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}