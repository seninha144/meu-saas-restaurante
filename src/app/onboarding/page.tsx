"use client";

import { useActionState, useState } from "react";
import { salvarConfiguracaoOperacional, type OnboardingState } from "./actions";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const estadoInicial: OnboardingState = {};

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(salvarConfiguracaoOperacional, estadoInicial);
  const [diasAbertos, setDiasAbertos] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));

  function alternarDia(dia: number) {
    setDiasAbertos((atual) => {
      const novo = new Set(atual);
      novo.has(dia) ? novo.delete(dia) : novo.add(dia);
      return novo;
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4 py-10 font-sans text-[#f1f0ec]">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">Antes de começar</p>
        <h1 className="mt-1 font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight">
          Configure o funcionamento do restaurante
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Isso ensina o gerador de escala quais dias e horários realmente precisam de cobertura.
        </p>

        <form action={formAction} className="mt-6 space-y-1.5">
          {DIAS.map((label, dia) => {
            const aberto = diasAbertos.has(dia);
            return (
              <div
                key={dia}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
              >
                <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`aberto-${dia}`}
                    checked={aberto}
                    onChange={() => alternarDia(dia)}
                    className="accent-[#E8A33D]"
                  />
                  {label}
                </label>

                {aberto ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="time"
                      name={`abertura-${dia}`}
                      defaultValue="09:00"
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white outline-none focus:border-[#E8A33D]/50"
                    />
                    <span className="text-xs text-white/30">até</span>
                    <input
                      type="time"
                      name={`fechamento-${dia}`}
                      defaultValue="23:00"
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white outline-none focus:border-[#E8A33D]/50"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-white/25">Fechado</span>
                )}
              </div>
            );
          })}

          <label className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Priorizar cobertura de fim de semana</p>
              <p className="text-xs text-white/40">
                Ao gerar a escala automaticamente, sábado e domingo são preenchidos antes dos demais dias.
              </p>
            </div>
            <input type="checkbox" name="coberturaFdsPrioritaria" defaultChecked className="h-5 w-9 accent-[#E8A33D]" />
          </label>

          {state.erro && <p className="text-sm text-[#E5484D]">{state.erro}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-4 w-full rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:opacity-70"
          >
            {pending ? "Salvando…" : "Concluir e ir para o painel"}
          </button>
        </form>
      </div>
    </div>
  );
}