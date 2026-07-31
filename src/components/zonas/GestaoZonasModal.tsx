"use client";

import { useActionState, useState, useTransition } from "react";
import { X } from "lucide-react";
import { salvarZona, removerZona, definirUsaZonas, type ZonaFormState } from "@/app/(dashboard)/zonas/actions";
import { PALETA_ZONAS } from "@/lib/escalas/paleta";
import type { Zona } from "@/types/dominio";

interface GestaoZonasModalProps {
  zonas: Zona[];
  usaZonas: boolean;
  onFechar: () => void;
}

const estadoInicial: ZonaFormState = {};

export function GestaoZonasModal({ zonas, usaZonas, onFechar }: GestaoZonasModalProps) {
  const [state, formAction, pending] = useActionState(salvarZona, estadoInicial);
  const [corSelecionada, setCorSelecionada] = useState(PALETA_ZONAS[0].hex);
  const [isPendingToggle, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 text-[#f1f0ec]">
        <div className="flex items-center justify-between">
          <h2 className="font-[Space_Grotesk,system-ui,sans-serif] text-lg font-semibold">Zonas do restaurante</h2>
          <button onClick={onFechar} className="text-white/40 hover:text-white/80">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <div>
            <p className="text-sm font-medium">Operar com zonas</p>
            <p className="text-xs text-white/40">Desligue se o restaurante funciona de forma linear/geral.</p>
          </div>
          <input
            type="checkbox"
            defaultChecked={usaZonas}
            disabled={isPendingToggle}
            onChange={(e) => startTransition(() => definirUsaZonas(e.target.checked))}
            className="h-5 w-9 accent-[#E8A33D]"
          />
        </label>

        {usaZonas && (
          <>
            <div className="mt-5 space-y-2">
              {zonas.map((z) => (
                <div key={z.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: z.cor }} />
                    <span className="text-sm">{z.nome}</span>
                  </div>
                  <button
                    onClick={() => removerZona(z.id)}
                    className="text-xs font-medium text-[#E5484D]/70 hover:text-[#E5484D]"
                  >
                    Remover
                  </button>
                </div>
              ))}
              {zonas.length === 0 && <p className="text-xs text-white/30">Nenhuma zona criada ainda.</p>}
            </div>

            <form action={formAction} className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
              <input type="hidden" name="cor" value={corSelecionada} />
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50">Nome da nova zona</label>
                <input
                  name="nome"
                  required
                  placeholder="Ex: Cozinha, Salão, Delivery…"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {PALETA_ZONAS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setCorSelecionada(p.hex)}
                      className={`h-6 w-6 rounded-full transition ${
                        corSelecionada === p.hex ? "ring-2 ring-white/60 ring-offset-2 ring-offset-[#111318]" : ""
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={p.nome}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/50">
                  Capacidade mínima por turno (opcional)
                </label>
                <input
                  name="capacidadeMinima"
                  type="number"
                  defaultValue={0}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
                />
              </div>

              {state.erro && <p className="text-sm text-[#E5484D]">{state.erro}</p>}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:opacity-70"
              >
                {pending ? "Salvando…" : "Adicionar zona"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}