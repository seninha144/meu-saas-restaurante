"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, MessageCircle, Sparkles, Loader2 } from "lucide-react";
import { formatarDiaHeader } from "@/lib/dates";
import type { Funcionario, HorarioFuncionamento, Periodo, Turno, Zona } from "@/types/dominio";
import { GapAlerta } from "./GapAlerta";
import { gerarEscalaAutomatica } from "@/app/(dashboard)/escalas/actions";
import type { Alerta } from "@/types/dominio";

const ALTURA_HORA_PX = 56;

interface GradeSemanalProps {
  escalaId: string;
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  alertas: Alerta[];
  dias: Date[];
  diasFuncionamento: number[];
  horarios: HorarioFuncionamento[];
  onAbrirNovoFuncionario: () => void;
  onAbrirGestaoZonas: () => void;
  onEditarFuncionario: (funcionario: Funcionario) => void;
}

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Fallback pra turnos antigos sem hora_inicio/hora_fim gravado (dados de antes dessa mudança). */
const JANELA_FALLBACK: Record<Periodo, [string, string]> = {
  Manhã: ["08:00", "12:00"],
  Tarde: ["12:00", "17:00"],
  Noite: ["17:00", "21:00"],
  Fechamento: ["21:00", "23:59"],
};

interface BlocoTurno {
  turno: Turno;
  funcionario: Funcionario;
  zona: Zona | null;
  inicioMin: number;
  fimMin: number;
  lane: number;
  totalLanes: number;
}

/** Atribui "faixas" (lanes) pra turnos que se sobrepõem no mesmo dia, tipo Google Calendar. */
function atribuirLanes(blocos: Omit<BlocoTurno, "lane" | "totalLanes">[]): BlocoTurno[] {
  const ordenados = [...blocos].sort((a, b) => a.inicioMin - b.inicioMin);
  const fimPorLane: number[] = [];
  const comLane = ordenados.map((b) => {
    let lane = fimPorLane.findIndex((fim) => fim <= b.inicioMin);
    if (lane === -1) {
      lane = fimPorLane.length;
      fimPorLane.push(b.fimMin);
    } else {
      fimPorLane[lane] = b.fimMin;
    }
    return { ...b, lane };
  });
  const totalLanes = Math.max(fimPorLane.length, 1);
  return comLane.map((b) => ({ ...b, totalLanes }));
}

export function GradeSemanal({
  escalaId,
  zonas,
  usaZonas,
  funcionarios,
  turnos,
  alertas,
  dias,
  diasFuncionamento,
  horarios,
  onAbrirNovoFuncionario,
  onAbrirGestaoZonas,
  onEditarFuncionario,
}: GradeSemanalProps) {
  const [zonaFiltro, setZonaFiltro] = useState<string | "todas">("todas");
  const router = useRouter();
  const [gerando, startGerando] = useTransition();
  const [resultadoGeracao, setResultadoGeracao] = useState<string | null>(null);

  function handleGerarEscala() {
    setResultadoGeracao(null);
    startGerando(async () => {
      const resultado = await gerarEscalaAutomatica(escalaId);
      if (resultado.erro) {
        setResultadoGeracao(resultado.erro);
      } else if (resultado.turnosGerados === 0 && (resultado.vagasSemCandidato ?? 0) > 0) {
        setResultadoGeracao(
          `${resultado.vagasSemCandidato} vaga(s) em aberto, mas nenhum funcionário elegível — verifique zona, disponibilidade e carga horária.`
        );
      } else {
        setResultadoGeracao(
          resultado.turnosGerados === 0 ? "Nenhum turno vazio para preencher." : `${resultado.turnosGerados} turno(s) gerado(s).`
        );
        router.refresh();
      }
    });
  }

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

  const turnosFiltrados = useMemo(() => {
    if (!usaZonas || zonaFiltro === "todas") return turnos;
    return turnos.filter((t) => t.zonaId === zonaFiltro);
  }, [turnos, usaZonas, zonaFiltro]);

  // eixo vertical: da abertura mais cedo até o fechamento mais tarde,
  // considerando só os dias que de fato abrem — arredondado pra hora cheia
  const { minMinutos, maxMinutos, horasEixo } = useMemo(() => {
    const abertos = horarios.filter((h) => !h.fechado && diasFuncionamento.includes(h.diaSemana));
    const aberturas = abertos.map((h) => paraMinutos(h.horaAbertura ?? "09:00"));
    const fechamentos = abertos.map((h) => paraMinutos(h.horaFechamento ?? "23:00"));

    const min = aberturas.length ? Math.floor(Math.min(...aberturas) / 60) * 60 : 9 * 60;
    const max = fechamentos.length ? Math.ceil(Math.max(...fechamentos) / 60) * 60 : 23 * 60;

    const horas: number[] = [];
    for (let h = min; h <= max; h += 60) horas.push(h);

    return { minMinutos: min, maxMinutos: max, horasEixo: horas };
  }, [horarios, diasFuncionamento]);

  const alturaTotalPx = ((maxMinutos - minMinutos) / 60) * ALTURA_HORA_PX;

  const blocosPorDia = useMemo(() => {
    const mapa = new Map<number, BlocoTurno[]>();

    for (let dia = 0; dia < 7; dia++) {
      const doDia = turnosFiltrados.filter((t) => t.dia === dia);

      const brutos = doDia
        .map((t) => {
          const f = funcionarioPorId.get(t.funcionarioId);
          if (!f) return null;
          const [fallbackInicio, fallbackFim] = JANELA_FALLBACK[t.periodo];
          const inicioStr = t.horaInicio ?? fallbackInicio;
          const fimStr = t.horaFim ?? fallbackFim;
          return {
            turno: t,
            funcionario: f,
            zona: t.zonaId ? zonaPorId.get(t.zonaId) ?? null : null,
            inicioMin: paraMinutos(inicioStr),
            fimMin: paraMinutos(fimStr),
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);

      mapa.set(dia, atribuirLanes(brutos));
    }

    return mapa;
  }, [turnosFiltrados, funcionarioPorId, zonaPorId]);

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
            onClick={handleGerarEscala}
            disabled={gerando}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {gerando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar escala automaticamente
              </>
            )}
          </button>
          <button
            onClick={onAbrirNovoFuncionario}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
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

      {resultadoGeracao && <p className="mt-2 text-xs text-white/40">{resultadoGeracao}</p>}

      {/* ============================ AGENDA POR HORA ============================ */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.06]">
        <div className="min-w-[980px]">
          {/* cabeçalho dos dias */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-white/[0.06] bg-white/[0.02]">
            <div className="px-2 py-3" />
            {dias.map((dia, i) => {
              const { abrev, numero } = formatarDiaHeader(dia);
              const aberto = diasFuncionamento.includes(i);
              return (
                <div
                  key={i}
                  className={`px-3 py-3 text-center text-xs font-medium uppercase tracking-wider ${
                    !aberto ? "text-white/15" : i >= 5 ? "text-white/60" : "text-white/30"
                  }`}
                >
                  {abrev} <span className={aberto ? "text-white/25" : "text-white/15"}>{numero}</span>
                </div>
              );
            })}
          </div>

          {/* corpo: eixo de horas + colunas de dias com blocos posicionados */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)]">
            {/* eixo de horas */}
            <div className="relative border-r border-white/[0.04]" style={{ height: alturaTotalPx }}>
              {horasEixo.map((min) => (
                <div
                  key={min}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-white/25"
                  style={{ top: ((min - minMinutos) / 60) * ALTURA_HORA_PX }}
                >
                  {String(Math.floor(min / 60)).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {dias.map((_, diaIdx) => {
              const aberto = diasFuncionamento.includes(diaIdx);
              const blocos = blocosPorDia.get(diaIdx) ?? [];

              return (
                <div
                  key={diaIdx}
                  className={`relative border-l border-white/[0.03] ${!aberto ? "bg-white/[0.008]" : ""}`}
                  style={{ height: alturaTotalPx }}
                >
                  {/* linhas de hora de fundo */}
                  {horasEixo.map((min) => (
                    <div
                      key={min}
                      className="absolute left-0 right-0 border-t border-white/[0.03]"
                      style={{ top: ((min - minMinutos) / 60) * ALTURA_HORA_PX }}
                    />
                  ))}

                  {!aberto && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rotate-90 text-[10px] tracking-wide text-white/10">Fechado</span>
                    </div>
                  )}

                  {aberto &&
                    blocos.map((b) => {
                      const top = Math.max(((b.inicioMin - minMinutos) / 60) * ALTURA_HORA_PX, 0);
                      const altura = Math.max(((b.fimMin - b.inicioMin) / 60) * ALTURA_HORA_PX, 20);
                      const largura = 100 / b.totalLanes;
                      const cor = b.zona?.cor ?? "#8B92A0";

                      return (
                        <button
                          key={b.turno.id}
                          onClick={() => onEditarFuncionario(b.funcionario)}
                          className="absolute overflow-hidden rounded-md border px-1.5 py-1 text-left transition hover:brightness-110"
                          style={{
                            top,
                            height: altura,
                            left: `${b.lane * largura}%`,
                            width: `calc(${largura}% - 3px)`,
                            backgroundColor: `${cor}22`,
                            borderColor: `${cor}55`,
                          }}
                        >
                          <p className="truncate text-[10px] font-semibold" style={{ color: cor }}>
                            {b.funcionario.nome}
                          </p>
                          <p className="truncate text-[9px] text-white/40">
                            {formatarHora(b.inicioMin)}–{formatarHora(b.fimMin)}
                          </p>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatarHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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