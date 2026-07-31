"use client";

import { useMemo, useState } from "react";
import { FileDown, MessageCircle } from "lucide-react";
import { formatarDiaHeader } from "@/lib/dates";
import type { Funcionario, Periodo, Turno, Zona } from "@/types/dominio";
import { PERIODOS } from "@/types/dominio";
import { TurnoCard } from "./TurnoCard";
import { GapAlerta } from "./GapAlerta";
import type { Alerta } from "@/types/dominio";

interface GradeSemanalProps {
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  alertas: Alerta[];
  dias: Date[]; // os 7 dias reais da semana exibida (Segunda a Domingo)
  onAbrirNovoFuncionario: () => void;
  onAbrirGestaoZonas: () => void;
  onEditarFuncionario: (funcionario: Funcionario) => void;
}

export function GradeSemanal({
  zonas,
  usaZonas,
  funcionarios,
  turnos,
  alertas,
  dias,
  onAbrirNovoFuncionario,
  onAbrirGestaoZonas,
  onEditarFuncionario,
}: GradeSemanalProps) {
  const [zonaFiltro, setZonaFiltro] = useState<string | "todas">("todas");

  const zonasVisiveis = usaZonas ? (zonaFiltro === "todas" ? zonas : zonas.filter((z) => z.id === zonaFiltro)) : [];

  const funcionarioPorId = useMemo(() => {
    const map = new Map<string, Funcionario>();
    funcionarios.forEach((f) => map.set(f.id, f));
    return map;
  }, [funcionarios]);

  const zonaPorId = useMemo(() => {
    const map = new Map<string, Zona>();
    zonas.forEach((z) => map.set(z.id, z));
    return map;
  }, [zonas]);

  function turnosDe(periodo: Periodo, dia: number, zonaId?: string | null) {
    return turnos.filter(
      (t) => t.periodo === periodo && t.dia === dia && (zonaId === undefined || t.zonaId === zonaId)
    );
  }

  return (
    <div>
      <GapAlerta alertas={alertas} dias={dias} />

      {/* ============================ TOOLBAR ============================ */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {usaZonas && (
            <>
              <FiltroChip ativo={zonaFiltro === "todas"} onClick={() => setZonaFiltro("todas")} label="Todas as zonas" />
              {zonas.map((z) => (
                <FiltroChip
                  key={z.id}
                  ativo={zonaFiltro === z.id}
                  onClick={() => setZonaFiltro(z.id)}
                  label={z.nome}
                  dotColor={z.cor}
                />
              ))}
              <button
                onClick={onAbrirGestaoZonas}
                className="ml-1 rounded-full border border-dashed border-white/15 px-3 py-1.5 text-xs font-medium text-white/40 transition hover:border-white/30 hover:text-white/70"
              >
                Gerenciar zonas
              </button>
            </>
          )}
          {!usaZonas && (
            <button
              onClick={onAbrirGestaoZonas}
              className="rounded-full border border-dashed border-white/15 px-3 py-1.5 text-xs font-medium text-white/40 transition hover:border-white/30 hover:text-white/70"
            >
              Este restaurante opera sem zonas · configurar
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onAbrirNovoFuncionario}
            className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105"
          >
            + Novo funcionário
          </button>
          <button className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]">
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </button>
          <button className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]">
            <MessageCircle className="h-4 w-4" />
            Enviar no WhatsApp
          </button>
        </div>
      </div>

      {/* ============================ GRADE ============================ */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.06]">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-white/[0.06] bg-white/[0.02]">
            <div className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-white/30">
              {usaZonas ? "Zona / turno" : "Turno"}
            </div>
            {dias.map((dia, i) => {
              const { abrev, numero } = formatarDiaHeader(dia);
              return (
                <div
                  key={i}
                  className={`px-3 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                    i >= 5 ? "text-white/60" : "text-white/30"
                  }`}
                >
                  {abrev} <span className="text-white/25">{numero}</span>
                </div>
              );
            })}
          </div>

          {usaZonas
            ? zonasVisiveis.map((zona) => (
                <BlocoDeLinhas
                  key={zona.id}
                  titulo={zona.nome}
                  cor={zona.cor}
                  dias={dias}
                  renderCelula={(periodo, diaIdx) =>
                    turnosDe(periodo, diaIdx, zona.id).map((slot) => {
                      const f = funcionarioPorId.get(slot.funcionarioId);
                      if (!f) return null;
                      return (
                        <TurnoCard
                          key={slot.id}
                          funcionario={f}
                          zona={zonaPorId.get(slot.zonaId ?? "") ?? null}
                          onClick={() => onEditarFuncionario(f)}
                        />
                      );
                    })
                  }
                />
              ))
            : (
                <BlocoDeLinhas
                  titulo={null}
                  cor="#8B92A0"
                  dias={dias}
                  renderCelula={(periodo, diaIdx) =>
                    turnosDe(periodo, diaIdx).map((slot) => {
                      const f = funcionarioPorId.get(slot.funcionarioId);
                      if (!f) return null;
                      return (
                        <TurnoCard key={slot.id} funcionario={f} zona={null} onClick={() => onEditarFuncionario(f)} />
                      );
                    })
                  }
                />
              )}
        </div>
      </div>
    </div>
  );
}

function BlocoDeLinhas({
  titulo,
  cor,
  dias,
  renderCelula,
}: {
  titulo: string | null;
  cor: string;
  dias: Date[];
  renderCelula: (periodo: Periodo, diaIdx: number) => React.ReactNode;
}) {
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      {PERIODOS.map((periodo, pIdx) => (
        <div
          key={periodo}
          className={`grid grid-cols-[140px_repeat(7,1fr)] ${
            pIdx !== PERIODOS.length - 1 ? "border-b border-white/[0.03]" : ""
          }`}
        >
          <div className="relative flex items-center gap-2 px-4 py-3">
            <span className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: cor }} />
            {pIdx === 0 && titulo ? (
              <span className="text-sm font-semibold text-white/85">{titulo}</span>
            ) : (
              <span className={titulo ? "pl-5 text-xs text-white/35" : "text-xs text-white/35"}>{periodo}</span>
            )}
          </div>

          {dias.map((_, diaIdx) => (
            <div key={diaIdx} className="flex min-h-[64px] flex-col gap-1.5 border-l border-white/[0.03] p-1.5">
              {(() => {
                const conteudo = renderCelula(periodo, diaIdx);
                const vazio = Array.isArray(conteudo) ? conteudo.every((c) => c === null) : !conteudo;
                if (vazio) {
                  return (
                    <div className="flex h-full min-h-[48px] items-center justify-center rounded-lg border border-dashed border-white/[0.06] text-[10px] text-white/15">
                      —
                    </div>
                  );
                }
                return conteudo;
              })()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  label,
  dotColor,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        ativo
          ? "border-white/20 bg-white/10 text-white"
          : "border-white/[0.06] bg-transparent text-white/45 hover:border-white/15 hover:text-white/70"
      }`}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      {label}
    </button>
  );
}