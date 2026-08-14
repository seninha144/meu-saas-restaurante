"use client";

import { useState } from "react";
import { FuncionarioModal } from "./FuncionarioModal";
import type { Funcionario, Zona } from "@/types/dominio";

interface FuncionariosListaProps {
  funcionarios: Funcionario[];
  zonas: Zona[];
  usaZonas: boolean;
  diasFuncionamento: number[];
}

export function FuncionariosLista({ funcionarios, zonas, usaZonas, diasFuncionamento }: FuncionariosListaProps) {
  const [modal, setModal] = useState<Funcionario | "novo" | null>(null);

  return (
    <>
      <button
        onClick={() => setModal("novo")}
        className="mt-4 rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105"
      >
        + Novo funcionário
      </button>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.06]">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-white/30">
          <span>Colaborador</span>
          <span>Carga contratada</span>
          <span>Valor/hora</span>
        </div>

        {funcionarios.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-white/30">Nenhum funcionário cadastrado ainda.</p>
        )}

        {funcionarios.map((f) => (
          <button
            key={f.id}
            onClick={() => setModal(f)}
            className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/[0.03] px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.03]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/70">
                {f.iniciais}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/90">
                  {f.nome}
                  {f.ehGerencia && (
                    <span className="ml-1.5 rounded bg-[#9B7BD1]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#9B7BD1]">
                      Gerência
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-white/35">{f.cargo}</p>
              </div>
            </div>
            <span className="text-sm text-white/60">{f.cargaHorariaSemanalMax}h/sem</span>
            <span className="text-sm text-white/60">
              {f.valorHora !== null
                ? f.valorHora.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })
                : "Padrão"}
            </span>
          </button>
        ))}
      </div>

      {modal && (
        <FuncionarioModal
          funcionario={modal === "novo" ? null : modal}
          zonas={zonas}
          usaZonas={usaZonas}
          diasFuncionamento={diasFuncionamento}
          onFechar={() => setModal(null)}
        />
      )}
    </>
  );
}