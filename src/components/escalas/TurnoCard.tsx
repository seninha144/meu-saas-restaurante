import type { Funcionario, Zona } from "@/types/dominio";

interface TurnoCardProps {
  funcionario: Funcionario;
  zona: Zona | null;
  onClick?: () => void;
}

export function TurnoCard({ funcionario, zona, onClick }: TurnoCardProps) {
  const excedente = funcionario.horasSemana - funcionario.cargaHorariaSemanalMax;
  const status: "critico" | "atencao" | "ok" =
    excedente > 0
      ? "critico"
      : funcionario.horasSemana >= funcionario.cargaHorariaSemanalMax - 4
      ? "atencao"
      : "ok";

  const folgasFaltando = Math.max(0, funcionario.folgasObrigatorias - funcionario.folgasUsadas);
  const cor = zona?.cor ?? "#8B92A0"; // cinza neutro quando não há zona (modo linear)

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 transition hover:border-white/15 hover:bg-white/[0.05] ${
        status === "critico" ? "ring-1 ring-[#E5484D]/40" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ backgroundColor: `${cor}1A`, color: cor }}
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