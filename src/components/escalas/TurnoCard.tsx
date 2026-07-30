import { SETOR_TOKENS } from "@/lib/escalas/config-visual";
import type { Funcionario } from "@/types/dominio";

interface TurnoCardProps {
  funcionario: Funcionario;
}

/**
 * Card de um funcionário dentro de um slot da grade semanal.
 * Mostra avatar (iniciais), nome, cargo, tag de horas com alerta de
 * hora extra e o contador de folgas obrigatórias.
 */
export function TurnoCard({ funcionario }: TurnoCardProps) {
  const token = SETOR_TOKENS[funcionario.setor];

  const excedente = funcionario.horasSemana - funcionario.cargaAlvo;
  const status: "critico" | "atencao" | "ok" =
    excedente > 0
      ? "critico"
      : funcionario.horasSemana >= funcionario.cargaAlvo - 4
      ? "atencao"
      : "ok";

  const folgasFaltando = Math.max(0, funcionario.folgasObrigatorias - funcionario.folgasUsadas);

  return (
    <div
      className={`group relative rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 transition hover:border-white/15 hover:bg-white/[0.05] ${
        status === "critico" ? "ring-1 ring-[#E5484D]/40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${token.bg} ${token.text}`}
        >
          {funcionario.iniciais}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white/90">{funcionario.nome}</p>
          <p className="truncate text-[10px] text-white/35">{funcionario.cargo}</p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
            status === "critico"
              ? "bg-[#E5484D]/15 text-[#E5484D]"
              : status === "atencao"
              ? "bg-[#F2C94C]/15 text-[#F2C94C]"
              : "bg-white/[0.06] text-white/40"
          }`}
        >
          {funcionario.horasSemana}h {status === "critico" ? `· +${excedente}h extra` : ""}
        </span>

        {folgasFaltando > 0 && (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-white/40">
            {funcionario.folgasUsadas}/{funcionario.folgasObrigatorias} folgas
          </span>
        )}
      </div>
    </div>
  );
}