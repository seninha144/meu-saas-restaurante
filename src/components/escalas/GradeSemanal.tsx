"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, FileDown, MessageCircle, Loader2 } from "lucide-react";
import { DIAS, PERIODOS, SETOR_TOKENS } from "@/lib/escalas/config-visual";
import type { Alerta, Funcionario, SetorKey, Turno } from "@/types/dominio";
import { TurnoCard } from "./TurnoCard";
import { GapAlerta } from "./GapAlerta";

interface GradeSemanalProps {
  funcionarios: Funcionario[];
  turnosIniciais: Turno[];
  alertas: Alerta[];
}

const TODOS_SETORES = Object.keys(SETOR_TOKENS) as SetorKey[];

export function GradeSemanal({ funcionarios, turnosIniciais, alertas }: GradeSemanalProps) {
  const [semana, setSemana] = useState<"atual" | "proxima">("atual");
  const [setorFiltro, setSetorFiltro] = useState<SetorKey | "todos">("todos");
  const [turnos, setTurnos] = useState<Turno[]>(turnosIniciais);
  const [gerandoIA, setGerandoIA] = useState(false);

  const setoresVisiveis = useMemo<SetorKey[]>(
    () => (setorFiltro === "todos" ? TODOS_SETORES : [setorFiltro]),
    [setorFiltro]
  );

  const funcionarioPorId = useMemo(() => {
    const map = new Map<string, Funcionario>();
    funcionarios.forEach((f) => map.set(f.id, f));
    return map;
  }, [funcionarios]);

  function turnosDe(setor: SetorKey, periodo: (typeof PERIODOS)[number], dia: number) {
    return turnos.filter((t) => t.setor === setor && t.periodo === periodo && t.dia === dia);
  }

  const inicioSemana = semana === "atual" ? "4 – 10 de agosto" : "11 – 17 de agosto";

  /**
   * Simula a geração de escala por IA: aguarda 2s (como se chamasse o
   * endpoint /api/escalas/gerar) e preenche os slots vazios com um
   * candidato elegível do próprio setor que ainda não trabalha naquele
   * dia — mesma regra de "sem choque de dia" do algoritmo real.
   */
  async function handleGerarComIA() {
    setGerandoIA(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setTurnos((atuais) => {
      const diasOcupados = new Map<string, Set<number>>();
      funcionarios.forEach((f) => diasOcupados.set(f.id, new Set()));
      atuais.forEach((t) => diasOcupados.get(t.funcionarioId)?.add(t.dia));

      const novos: Turno[] = [...atuais];
      let contador = 0;

      for (const setor of TODOS_SETORES) {
        for (let dia = 0; dia < 7; dia++) {
          for (const periodo of PERIODOS) {
            const jaExiste = novos.some(
              (t) => t.setor === setor && t.periodo === periodo && t.dia === dia
            );
            if (jaExiste) continue;

            const candidato = funcionarios
              .filter((f) => f.setor === setor && !diasOcupados.get(f.id)?.has(dia))
              .sort((a, b) => a.horasSemana - b.horasSemana)[0];

            if (candidato) {
              contador++;
              novos.push({
                id: `ia-${setor}-${dia}-${periodo}-${contador}`,
                funcionarioId: candidato.id,
                setor,
                periodo,
                dia,
              });
              diasOcupados.get(candidato.id)?.add(dia);
            }
          }
        }
      }

      return novos;
    });

    setGerandoIA(false);
  }

  return (
    <div>
      <GapAlerta alertas={alertas} />

      {/* ============================ TOOLBAR ============================ */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <FiltroChip ativo={setorFiltro === "todos"} onClick={() => setSetorFiltro("todos")} label="Todos os setores" />
          {TODOS_SETORES.map((key) => {
            const t = SETOR_TOKENS[key];
            return (
              <FiltroChip
                key={key}
                ativo={setorFiltro === key}
                onClick={() => setSetorFiltro(key)}
                label={t.label}
                dotColor={t.accent}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGerarComIA}
            disabled={gerandoIA}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2 text-sm font-semibold text-[#1a1206] shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset] transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {gerandoIA ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando escala…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar escala com IA
              </>
            )}
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

      {/* toggle de semana e período — junto do título na página, aqui repito o período para contexto local */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-white/40">{inicioSemana}</p>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => setSemana("atual")}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              semana === "atual" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Semana atual
          </button>
          <button
            onClick={() => setSemana("proxima")}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              semana === "proxima" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            Próxima semana
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ============================ GRADE SEMANAL ============================ */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.06]">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-white/[0.06] bg-white/[0.02]">
            <div className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-white/30">
              Setor / turno
            </div>
            {DIAS.map((d, i) => (
              <div
                key={d}
                className={`px-3 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                  i >= 5 ? "text-white/60" : "text-white/30"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {setoresVisiveis.map((setorKey) => {
            const t = SETOR_TOKENS[setorKey];
            const Icon = t.icon;
            return (
              <div key={setorKey} className="border-b border-white/[0.06] last:border-b-0">
                {PERIODOS.map((periodo, pIdx) => (
                  <div
                    key={periodo}
                    className={`grid grid-cols-[140px_repeat(7,1fr)] ${
                      pIdx !== PERIODOS.length - 1 ? "border-b border-white/[0.03]" : ""
                    }`}
                  >
                    <div className="relative flex items-center gap-2 px-4 py-3">
                      <span className={`absolute left-0 top-0 h-full w-[3px] ${t.bar}`} />
                      {pIdx === 0 ? (
                        <>
                          <Icon className={`h-3.5 w-3.5 ${t.text}`} />
                          <span className="text-sm font-semibold text-white/85">{t.label}</span>
                        </>
                      ) : (
                        <span className="pl-5 text-xs text-white/35">{periodo}</span>
                      )}
                    </div>

                    {DIAS.map((_, diaIdx) => {
                      const slots = turnosDe(setorKey, periodo, diaIdx);
                      return (
                        <div
                          key={diaIdx}
                          className="flex min-h-[64px] flex-col gap-1.5 border-l border-white/[0.03] p-1.5"
                        >
                          {slots.length === 0 ? (
                            <div className="flex h-full min-h-[48px] items-center justify-center rounded-lg border border-dashed border-white/[0.06] text-[10px] text-white/15">
                              —
                            </div>
                          ) : (
                            slots.map((slot) => {
                              const f = funcionarioPorId.get(slot.funcionarioId);
                              if (!f) return null;
                              return <TurnoCard key={slot.id} funcionario={f} />;
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs text-white/25">
        Dados de exemplo — conecte ao Supabase para refletir turnos e horas reais.
      </p>
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