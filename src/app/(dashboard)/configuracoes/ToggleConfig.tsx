"use client";

import { useState, useTransition } from "react";
import { definirPontoAutomatico } from "./actions";

export function ToggleConfig({ ativoInicial }: { ativoInicial: boolean }) {
  const [ativo, setAtivo] = useState(ativoInicial);
  const [, startTransition] = useTransition();

  return (
    <label className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-white/90">Bater entrada e saída automático</p>
        <p className="mt-0.5 text-xs text-white/40">
          Quando ligado, um processo registra entrada/saída sozinho no horário exato do turno agendado, marcado como{" "}
          <span className="text-white/60">origem automática</span> pra você auditar depois. Se o colaborador bater
          o próprio ponto manualmente, isso sempre tem prioridade.
        </p>
      </div>
      <input
        type="checkbox"
        checked={ativo}
        onChange={(e) => {
          setAtivo(e.target.checked);
          startTransition(() => definirPontoAutomatico(e.target.checked));
        }}
        className="h-5 w-9 shrink-0 accent-[#E8A33D]"
      />
    </label>
  );
}