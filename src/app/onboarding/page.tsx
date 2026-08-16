"use client";

import { useActionState } from "react";
import {
  salvarConfiguracaoOperacional,
  type OnboardingState,
} from "./actions";

const DIAS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const estadoInicial: OnboardingState = {};

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(
    salvarConfiguracaoOperacional,
    estadoInicial
  );

  return (
    <main className="min-h-screen bg-[#0b0d10] px-4 py-10 text-[#f1f0ec]">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
            Configuração inicial
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Configure o funcionamento do restaurante
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
            Estas informações definem a base operacional do restaurante.
            Mais tarde, o gerador de escalas poderá utilizar este contexto
            para tomar decisões mais inteligentes.
          </p>
        </div>

        <form action={formAction} className="space-y-6">
          {/* DIAS E HORÁRIOS */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-white">
                Dias e horários de funcionamento
              </h2>

              <p className="mt-1 text-sm leading-5 text-white/40">
                Indique em que dias o restaurante funciona e quais são os
                horários reais de abertura e fechamento.
              </p>
            </div>

            <div className="space-y-2">
              {DIAS.map((dia, index) => (
                <div
                  key={dia}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <label className="flex min-w-[140px] items-center gap-3">
                      <input
                        type="checkbox"
                        name={`aberto-${index}`}
                        defaultChecked
                        className="h-4 w-4 accent-[#E8A33D]"
                      />

                      <span className="text-sm font-medium text-white">
                        {dia}
                      </span>
                    </label>

                    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div>
                        <label
                          htmlFor={`abertura-${index}`}
                          className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/30"
                        >
                          Abertura
                        </label>

                        <input
                          id={`abertura-${index}`}
                          type="time"
                          name={`abertura-${index}`}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[#E8A33D]/50"
                        />
                      </div>

                      <span className="hidden text-xs text-white/25 sm:block">
                        até
                      </span>

                      <div>
                        <label
                          htmlFor={`fechamento-${index}`}
                          className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/30"
                        >
                          Fechamento
                        </label>

                        <input
                          id={`fechamento-${index}`}
                          type="time"
                          name={`fechamento-${index}`}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[#E8A33D]/50"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* COBERTURA FDS */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-white">
                Cobertura de fim de semana
              </h2>

              <p className="mt-1 text-sm leading-5 text-white/40">
                Esta preferência será utilizada pelo sistema posteriormente
                ao distribuir a cobertura do fim de semana.
              </p>
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div>
                <p className="text-sm font-medium text-white">
                  Priorizar cobertura de fim de semana
                </p>

                <p className="mt-1 text-xs leading-5 text-white/40">
                  Indica que sábado e domingo devem receber atenção especial
                  durante a geração das escalas.
                </p>
              </div>

              <input
                type="checkbox"
                name="coberturaFdsPrioritaria"
                defaultChecked
                className="mt-1 h-4 w-4 shrink-0 accent-[#E8A33D]"
              />
            </label>
          </section>

          {/* INFORMAÇÃO SOBRE PRÓXIMAS CONFIGURAÇÕES */}
          <section className="rounded-2xl border border-[#E8A33D]/10 bg-[#E8A33D]/[0.03] p-6">
            <h2 className="text-sm font-semibold text-white">
              O que vamos configurar depois
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/45">
              Depois desta configuração, o onboarding será expandido para
              compreender melhor a operação do restaurante: períodos reais
              como abertura, almoço, tarde e fechamento, movimento esperado
              e necessidade de equipa. Esses dados serão utilizados pelo
              gerador para tomar decisões, sem colocar a lógica da escala
              dentro do onboarding.
            </p>
          </section>

          {/* ERRO */}
          {state?.erro && (
            <div className="rounded-xl border border-[#E5484D]/20 bg-[#E5484D]/[0.06] px-4 py-3">
              <p className="text-sm text-[#E5484D]">{state.erro}</p>
            </div>
          )}

          {/* BOTÃO */}
          <div className="flex justify-end border-t border-white/[0.06] pt-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-6 py-3 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "A guardar..." : "Guardar configuração"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}