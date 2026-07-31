"use client";

import { useActionState } from "react";
import { criarGerente, type CriarGerenteState } from "@/app/(super-admin)/gerentes/actions";

const estadoInicial: CriarGerenteState = {};

export function NovoGerenteForm() {
  const [state, formAction, pending] = useActionState(criarGerente, estadoInicial);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Campo label="Nome do restaurante" name="nomeRestaurante" required />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/50">País</label>
        <select
          name="pais"
          defaultValue="BR"
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
        >
          <option value="BR">Brasil</option>
          <option value="PT">Portugal</option>
        </select>
      </div>
      <Campo label="Nome do gerente" name="nomeGerente" required />
      <Campo label="E-mail de acesso" name="email" type="email" required />
      <Campo label="Senha provisória" name="senha" type="password" required />

      <div className="sm:col-span-2">
        {state.erro && <p className="mb-2 text-sm text-[#E5484D]">{state.erro}</p>}
        {state.sucesso && <p className="mb-2 text-sm text-[#3EC6B9]">Gerente criado com sucesso.</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:opacity-70"
        >
          {pending ? "Criando…" : "Criar conta de gerente"}
        </button>
      </div>
    </form>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white/50">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
      />
    </div>
  );
}