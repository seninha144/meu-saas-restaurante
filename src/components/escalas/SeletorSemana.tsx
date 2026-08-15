"use client";

import { useState, useTransition } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Trash2,
} from "lucide-react";
import { formatarIntervalo } from "@/lib/dates";
import { deletarEscalaDaSemana } from "@/app/(dashboard)/escalas/actions";

interface SeletorSemanaProps {
  inicio: Date;
  fim: Date;
  offsetAtual: number;
  escalaId: string;
}

export function SeletorSemana({
  inicio,
  fim,
  offsetAtual,
  escalaId,
}: SeletorSemanaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [menuAberto, setMenuAberto] =
    useState(false);

  const [erro, setErro] =
    useState<string | null>(null);

  const [
    deletando,
    startDeletando,
  ] = useTransition();

  function irParaSemana(
    novoOffset: number
  ) {
    const params =
      new URLSearchParams(
        searchParams.toString()
      );

    /*
     * 0  = semana atual
     * -1 = semana anterior
     * +1 = próxima semana
     *
     * O cálculo das datas é feito por
     * getSemana() em lib/dates.ts.
     */
    if (novoOffset === 0) {
      params.delete("semana");
    } else {
      params.set(
        "semana",
        String(novoOffset)
      );
    }

    const query =
      params.toString();

    router.push(
      query
        ? `${pathname}?${query}`
        : pathname,
      {
        scroll: false,
      }
    );
  }

  function deletarSemana() {
    const confirmado =
      window.confirm(
        "Deseja realmente deletar a escala desta semana? Todos os turnos desta semana serão apagados."
      );

    if (!confirmado) {
      return;
    }

    setErro(null);

    startDeletando(async () => {
      const resultado =
        await deletarEscalaDaSemana(
          escalaId
        );

      if (resultado.erro) {
        setErro(
          resultado.erro
        );
        return;
      }

      setMenuAberto(false);

      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      {/* =====================================================
          INTERVALO DA SEMANA + MENU DE AÇÕES
          ===================================================== */}

      <div className="flex min-w-0 items-center gap-2">
        <p className="text-sm text-white/40">
          {formatarIntervalo(
            inicio,
            fim
          )}
        </p>

        <div className="relative">
          <button
            type="button"
            aria-label="Ações da escala"
            aria-expanded={
              menuAberto
            }
            onClick={() =>
              setMenuAberto(
                (aberto) =>
                  !aberto
              )
            }
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <EllipsisVertical className="h-4 w-4" />
          </button>

          {menuAberto && (
            <div className="absolute left-0 top-full z-30 mt-2 w-56 rounded-xl border border-white/10 bg-[#151515] p-1.5 shadow-2xl">
              <button
                type="button"
                onClick={
                  deletarSemana
                }
                disabled={
                  deletando
                }
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />

                {deletando
                  ? "Deletando…"
                  : "Deletar escala da semana"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          NAVEGAÇÃO DAS SEMANAS
          ===================================================== */}

      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
        {/* Semana anterior */}
        <button
          type="button"
          onClick={() =>
            irParaSemana(
              offsetAtual - 1
            )
          }
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
        >
          <ChevronLeft className="h-3.5 w-3.5" />

          Semana anterior
        </button>

        {/* Semana atual */}
        <button
          type="button"
          onClick={() =>
            irParaSemana(0)
          }
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            offsetAtual === 0
              ? "bg-white/10 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Atual
        </button>

        {/* Próxima semana */}
        <button
          type="button"
          onClick={() =>
            irParaSemana(
              offsetAtual + 1
            )
          }
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
        >
          Próxima semana

          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* =====================================================
          ERRO
          ===================================================== */}

      {erro && (
        <p className="absolute mt-20 text-xs text-red-300">
          {erro}
        </p>
      )}
    </div>
  );
}