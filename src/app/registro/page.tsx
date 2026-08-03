"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registrarRestaurante, type RegistroState } from "./actions";

const estadoInicial: RegistroState = {};
const TOTAL_PASSOS = 3;

export default function RegistroPage() {
  const [state, formAction, pending] = useActionState(registrarRestaurante, estadoInicial);
  const [passo, setPasso] = useState(1);

  function avancar() {
    setPasso((p) => Math.min(p + 1, TOTAL_PASSOS));
  }
  function voltar() {
    setPasso((p) => Math.max(p - 1, 1));
  }

  if (state.sucesso) {
    if (typeof window !== "undefined") window.location.href = "/onboarding";
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4 py-10 font-sans text-[#f1f0ec]">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">Criar conta</p>
        <h1 className="mt-1 font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight">
          {passo === 1 && "Conta e restaurante"}
          {passo === 2 && "Perfil operacional"}
          {passo === 3 && "Ciclo financeiro"}
        </h1>

        <div className="mt-4 flex gap-1.5">
          {[1, 2, 3].map((p) => (
            <div key={p} className={`h-1 flex-1 rounded-full ${p <= passo ? "bg-[#E8A33D]" : "bg-white/10"}`} />
          ))}
        </div>

        <form action={formAction} className="mt-6 space-y-4">
          <div className={passo === 1 ? "space-y-4" : "hidden"}>
            <Campo label="Seu nome" name="nomeGerente" required={passo === 1} />
            <Campo label="E-mail" name="email" type="email" required={passo === 1} />
            <Campo label="Senha" name="senha" type="password" required={passo === 1} />
            <Campo label="Nome do restaurante" name="nomeRestaurante" required={passo === 1} />
          </div>

          <div className={passo === 2 ? "space-y-4" : "hidden"}>
            <Campo
              label="Quantidade estimada de funcionários (você incluído)"
              name="totalFuncionarios"
              type="number"
              defaultValue={10}
            />
            <Campo
              label="Valor/hora padrão da equipe (€)"
              name="valorHoraPadrao"
              type="number"
              step="0.01"
              placeholder="Ex: 7.50"
            />
            <p className="text-xs text-white/30">
              Isso é só um ponto de partida — cada colaborador pode ter um valor/hora próprio depois, na ficha dele.
            </p>
          </div>

          <div className={passo === 3 ? "space-y-4" : "hidden"}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">
                Frequência padrão de pagamento
              </label>
              <select
                name="frequenciaPagamentoPadrao"
                defaultValue="mes"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
              >
                <option value="dia">Diária</option>
                <option value="semana">Semanal</option>
                <option value="quinzena">Quinzenal</option>
                <option value="mes">Mensal</option>
              </select>
            </div>
          </div>

          {state.erro && <p className="text-sm text-[#E5484D]">{state.erro}</p>}

          <div className="flex items-center justify-between pt-2">
            {passo > 1 ? (
              <button
                type="button"
                onClick={voltar}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.08]"
              >
                Voltar
              </button>
            ) : (
              <span />
            )}

            {passo < TOTAL_PASSOS ? (
              <button
                type="button"
                onClick={avancar}
                className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-5 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105"
              >
                Próximo
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-5 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:opacity-70"
              >
                {pending ? "Criando conta…" : "Começar teste grátis de 14 dias"}
              </button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-medium text-[#E8A33D] hover:underline">
            Faça login
          </Link>
        </p>
      </div>
    </div>
  );
}

function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  step,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white/50">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
      />
    </div>
  );
}