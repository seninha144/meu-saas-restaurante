"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrar, type LoginState } from "./actions";

const estadoInicial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(entrar, estadoInicial);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d10] px-4 font-sans text-[#f1f0ec]">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
          Painel operacional
        </p>
        <h1 className="mt-1 font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight">
          Entrar
        </h1>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">E-mail</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">Senha</label>
            <input
              name="senha"
              type="password"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
            />
          </div>

          {state.erro && <p className="text-sm text-[#E5484D]">{state.erro}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:opacity-70"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          Não tem uma conta?{" "}
          <Link href="/registro" className="font-medium text-[#E8A33D] hover:underline">
            Crie uma conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}