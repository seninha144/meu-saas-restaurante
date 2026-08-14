"use client";

import { useState, useTransition } from "react";
import { Check, Clock } from "lucide-react";
import { marcarComoPago } from "@/app/(dashboard)/funcionarios/actions";
import type { Funcionario, ResumoPagamento } from "@/types/dominio";

interface Linha {
  funcionario: Funcionario;
  resumo: ResumoPagamento;
}

export function PagamentosTable({ linhas: linhasIniciais }: { linhas: Linha[] }) {
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [pagando, startPagando] = useTransition();
  const [erroPorId, setErroPorId] = useState<Record<string, string>>({});

  function handlePagar(funcionarioId: string) {
    startPagando(async () => {
      const resultado = await marcarComoPago(funcionarioId);
      if (resultado.erro) {
        setErroPorId((atual) => ({ ...atual, [funcionarioId]: resultado.erro! }));
        return;
      }
      setLinhas((atual) =>
        atual.map((l) =>
          l.funcionario.id === funcionarioId
            ? { ...l, resumo: { ...l.resumo, horasFinalizadasNaoPagas: 0, valorFinalizadoNaoPago: 0 } }
            : l
        )
      );
    });
  }

  const pendentes = linhas.filter((l) => l.resumo.valorFinalizadoNaoPago > 0 || l.resumo.pontoEmAberto);
  const semSaldo = linhas.filter((l) => l.resumo.valorFinalizadoNaoPago === 0 && !l.resumo.pontoEmAberto);

  return (
    <div className="mt-6 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-white/30">
          <span>Colaborador</span>
          <span className="text-right">Horas</span>
          <span className="text-right">A pagar</span>
          <span />
        </div>

        {pendentes.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-white/30">Nenhum saldo pendente no momento.</p>
        )}

        {pendentes.map(({ funcionario, resumo }) => (
          <div
            key={funcionario.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-white/[0.03] px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white/90">{funcionario.nome}</p>
              <p className="truncate text-xs text-white/35">{funcionario.cargo}</p>
              {erroPorId[funcionario.id] && (
                <p className="mt-0.5 text-xs text-[#E5484D]">{erroPorId[funcionario.id]}</p>
              )}
            </div>

            <span className="text-right text-sm text-white/60">
              {resumo.horasFinalizadasNaoPagas}h
              {resumo.pontoEmAberto && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-[#3EC6B9]">
                  <Clock className="h-2.5 w-2.5 animate-pulse" />+{resumo.horasEmAndamento}h
                </span>
              )}
            </span>

            <span className="text-right text-sm font-semibold text-white/90">
              {resumo.valorFinalizadoNaoPago.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
            </span>

            <button
              onClick={() => handlePagar(funcionario.id)}
              disabled={pagando || resumo.valorFinalizadoNaoPago === 0}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#3EC6B9] to-[#2ea89c] px-3 py-1.5 text-xs font-semibold text-[#04201d] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Pagamento Feito
            </button>
          </div>
        ))}
      </div>

      {semSaldo.length > 0 && (
        <details className="rounded-2xl border border-white/[0.06] px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium text-white/40">
            {semSaldo.length} colaborador(es) em dia
          </summary>
          <div className="mt-2 space-y-1">
            {semSaldo.map(({ funcionario }) => (
              <p key={funcionario.id} className="text-xs text-white/30">
                {funcionario.nome}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}