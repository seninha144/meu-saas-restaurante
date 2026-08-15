"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileDown,
  MessageCircle,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  Rows3,
} from "lucide-react";
import { formatarDiaHeader } from "@/lib/dates";
import { formatarHoras, horasEfetivasDoTurno } from "@/lib/horas";
import type { Funcionario, HorarioFuncionamento, Periodo, Turno, Zona } from "@/types/dominio";
import { GapAlerta } from "./GapAlerta";
import { gerarEscalaAutomatica } from "@/app/(dashboard)/escalas/actions";
import type { Alerta } from "@/types/dominio";

const ALTURA_HORA_PX = 56;
const ALTURA_MAXIMA_AGENDA_PX = 560;
const ALTURA_MAXIMA_MATRIZ_PX = 640;

interface GradeSemanalProps {
  escalaId: string;
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  possuiTurnos: boolean;
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
function formatarHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function resumoJornada(turno: Turno, pausaAlmocoMinutos: number): string {
  const horasLiquidas = horasEfetivasDoTurno(turno.horaInicio, turno.horaFim, pausaAlmocoMinutos);
  return `${formatarHoras(horasLiquidas)} líquidas · pausa ${pausaAlmocoMinutos}min`;
}

const JANELA_FALLBACK: Record<Periodo, [string, string]> = {
  Manhã: ["08:00", "12:00"],
  Tarde: ["12:00", "17:00"],
  Noite: ["17:00", "21:00"],
  Fechamento: ["21:00", "23:59"],
};

interface Membro {
  funcionario: Funcionario;
  turno: Turno;
}

interface GrupoTurno {
  chave: string;
  zona: Zona | null;
  inicioMin: number;
  fimMin: number;
  membros: Membro[];
  lane: number;
  totalLanes: number;
}

/** Agrupa turnos com o MESMO horário e zona no mesmo dia — é isso que evita 30 lanes lado a lado quando todo mundo faz o mesmo turno. */
function agruparPorHorario(
  itens: { turno: Turno; funcionario: Funcionario; zona: Zona | null; inicioMin: number; fimMin: number }[]
): Omit<GrupoTurno, "lane" | "totalLanes">[] {
  const porChave = new Map<string, Omit<GrupoTurno, "lane" | "totalLanes">>();
  for (const item of itens) {
    const chave = `${item.zona?.id ?? "sem-zona"}:${item.inicioMin}:${item.fimMin}`;
    const existente = porChave.get(chave);
    if (existente) {
      existente.membros.push({ funcionario: item.funcionario, turno: item.turno });
    } else {
      porChave.set(chave, {
        chave,
        zona: item.zona,
        inicioMin: item.inicioMin,
        fimMin: item.fimMin,
        membros: [{ funcionario: item.funcionario, turno: item.turno }],
      });
    }
  }
  return Array.from(porChave.values());
}

function atribuirLanes(grupos: Omit<GrupoTurno, "lane" | "totalLanes">[]): GrupoTurno[] {
  const ordenados = [...grupos].sort((a, b) => a.inicioMin - b.inicioMin);
  const fimPorLane: number[] = [];
  const comLane = ordenados.map((g) => {
    let lane = fimPorLane.findIndex((fim) => fim <= g.inicioMin);
    if (lane === -1) {
      lane = fimPorLane.length;
      fimPorLane.push(g.fimMin);
    } else {
      fimPorLane[lane] = g.fimMin;
    }
    return { ...g, lane };
  });
  const totalLanes = Math.max(fimPorLane.length, 1);
  return comLane.map((g) => ({ ...g, totalLanes }));
}

export function GradeSemanal({
  escalaId,
  zonas,
  usaZonas,
  funcionarios,
  turnos,
  possuiTurnos,
  alertas,
  dias,
  diasFuncionamento,
  horarios,
  onAbrirNovoFuncionario,
  onAbrirGestaoZonas,
  onEditarFuncionario,
}: GradeSemanalProps) {
  const [zonaFiltro, setZonaFiltro] = useState<string | "todas">("todas");
  const [abaEquipe, setAbaEquipe] = useState<"geral" | "gerencia">("geral");
  const [modoAltaDemanda, setModoAltaDemanda] = useState(false);
  const [modoVisualizacao, setModoVisualizacao] = useState<"timeline" | "matriz">("timeline");
  const [grupoExpandido, setGrupoExpandido] = useState<string | null>(null);
  const router = useRouter();
  const [gerando, startGerando] = useTransition();
  const [resultadoGeracao, setResultadoGeracao] = useState<string | null>(null);

  const temGerencia = funcionarios.some((f) => f.ehGerencia);

  function handleGerarEscala() {
    if (
      possuiTurnos &&
      !window.confirm("Esta ação vai substituir todos os turnos desta semana pela nova geração automática. Deseja continuar?")
    ) {
      return;
    }
    setResultadoGeracao(null);
    startGerando(async () => {
      const resultado = await gerarEscalaAutomatica(escalaId, modoAltaDemanda, possuiTurnos);
      if (resultado.erro) {
        setResultadoGeracao(resultado.erro);
      } else if (resultado.turnosGerados === 0 && (resultado.vagasSemCandidato ?? 0) > 0) {
        setResultadoGeracao(
          `${resultado.vagasSemCandidato} vaga(s) em aberto, mas nenhum funcionário elegível — verifique zona, carga horária e folgas.`
        );
        router.refresh();
      } else {
        const resumoMeta = resultado.funcionariosComMetaIncompleta
          ? `${resultado.funcionariosComMetaIncompleta} colaborador(es) ainda com ${resultado.horasNaoAlocadas}h não alocadas.`
          : "Metas semanais concluídas.";
        setResultadoGeracao(
          `${resultado.turnosGerados ?? 0} turno(s) gerado(s). ${resumoMeta}`
        );
        router.refresh();
      }
    });
  }

  const funcionariosDaAba = useMemo(
    () => funcionarios.filter((f) => (abaEquipe === "gerencia" ? f.ehGerencia : !f.ehGerencia)),
    [funcionarios, abaEquipe]
  );
  const funcionarioPorId = useMemo(() => {
    const map = new Map<string, Funcionario>();
    funcionariosDaAba.forEach((f) => map.set(f.id, f));
    return map;
  }, [funcionariosDaAba]);
  const zonaPorId = useMemo(() => {
    const map = new Map<string, Zona>();
    zonas.forEach((z) => map.set(z.id, z));
    return map;
  }, [zonas]);

  const turnosFiltrados = useMemo(() => {
    let base = turnos.filter((t) => funcionarioPorId.has(t.funcionarioId));
    if (usaZonas && zonaFiltro !== "todas") base = base.filter((t) => t.zonaId === zonaFiltro);
    return base;
  }, [turnos, funcionarioPorId, usaZonas, zonaFiltro]);

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

  const gruposPorDia = useMemo(() => {
    const mapa = new Map<number, GrupoTurno[]>();
    for (let dia = 0; dia < 7; dia++) {
      const doDia = turnosFiltrados.filter((t) => t.dia === dia);
      const itens = doDia
        .map((t) => {
          const f = funcionarioPorId.get(t.funcionarioId);
          if (!f) return null;
          const [fallbackInicio, fallbackFim] = JANELA_FALLBACK[t.periodo];
          return {
            turno: t,
            funcionario: f,
            zona: t.zonaId ? zonaPorId.get(t.zonaId) ?? null : null,
            inicioMin: paraMinutos(t.horaInicio ?? fallbackInicio),
            fimMin: paraMinutos(t.horaFim ?? fallbackFim),
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      mapa.set(dia, atribuirLanes(agruparPorHorario(itens)));
    }
    return mapa;
  }, [turnosFiltrados, funcionarioPorId, zonaPorId]);

  // ---- dados pro modo Matriz: linha por funcionário, agrupado por zona
  const gruposMatriz = useMemo(() => {
    if (!usaZonas) return [{ zona: null as Zona | null, funcionarios: funcionariosDaAba }];
    const zonasFiltradas = zonaFiltro === "todas" ? zonas : zonas.filter((z) => z.id === zonaFiltro);
    return zonasFiltradas.map((zona) => ({
      zona,
      funcionarios: funcionariosDaAba.filter((f) => f.zonaId === zona.id),
    }));
  }, [usaZonas, zonas, zonaFiltro, funcionariosDaAba]);

  const turnoPorFuncionarioDia = useMemo(() => {
    const map = new Map<string, Turno>();
    turnosFiltrados.forEach((t) => map.set(`${t.funcionarioId}:${t.dia}`, t));
    return map;
  }, [turnosFiltrados]);

  return (
    <div>
      <GapAlerta alertas={alertas} dias={dias} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {temGerencia ? (
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            <button
              onClick={() => setAbaEquipe("geral")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                abaEquipe === "geral" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              Equipe geral
            </button>
            <button
              onClick={() => setAbaEquipe("gerencia")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                abaEquipe === "gerencia" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              Gerência
            </button>
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => setModoVisualizacao("timeline")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              modoVisualizacao === "timeline" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Timeline
          </button>
          <button
            onClick={() => setModoVisualizacao("matriz")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              modoVisualizacao === "matriz" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <Rows3 className="h-3.5 w-3.5" />
            Matriz
          </button>
        </div>
      </div>

      {/* ============================ TOOLBAR ============================ */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <label
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              modoAltaDemanda ? "border-[#E5484D]/40 bg-[#E5484D]/10 text-[#E5484D]" : "border-white/[0.06] text-white/45"
            }`}
          >
            <input
              type="checkbox"
              checked={modoAltaDemanda}
              onChange={(e) => setModoAltaDemanda(e.target.checked)}
              className="accent-[#E5484D]"
            />
            Alta demanda
          </label>
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
                {possuiTurnos ? "Gerar novamente a escala semanal" : "Gerar escala automaticamente"}
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

      {modoVisualizacao === "timeline" ? (
        <>
          {/* ============================ TIMELINE ============================ */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.06]" onClick={() => setGrupoExpandido(null)}>
            <div className="min-w-[980px]">
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

              <div className="overflow-y-auto" style={{ maxHeight: ALTURA_MAXIMA_AGENDA_PX }}>
                <div className="grid grid-cols-[64px_repeat(7,1fr)]">
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
                    const grupos = gruposPorDia.get(diaIdx) ?? [];

                    return (
                      <div
                        key={diaIdx}
                        className={`relative border-l border-white/[0.03] ${!aberto ? "bg-white/[0.008]" : ""}`}
                        style={{ height: alturaTotalPx }}
                      >
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
                          grupos.map((g) => {
                            const top = Math.max(((g.inicioMin - minMinutos) / 60) * ALTURA_HORA_PX, 0);
                            const altura = Math.max(((g.fimMin - g.inicioMin) / 60) * ALTURA_HORA_PX, 22);
                            const largura = 100 / g.totalLanes;
                            const cor = g.zona?.cor ?? "#8B92A0";
                            const chaveGrupo = `${diaIdx}:${g.chave}`;
                            const expandido = grupoExpandido === chaveGrupo;
                            const primeirosNomes = g.membros.slice(0, 2);
                            const restantes = g.membros.length - primeirosNomes.length;

                            return (
                              <div
                                key={g.chave}
                                className="absolute"
                                style={{ top, height: altura, left: `${g.lane * largura}%`, width: `calc(${largura}% - 3px)` }}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGrupoExpandido(expandido ? null : chaveGrupo);
                                  }}
                                  className="h-full w-full overflow-hidden rounded-md border px-1.5 py-1 text-left transition hover:brightness-110"
                                  style={{ backgroundColor: `${cor}22`, borderColor: `${cor}55` }}
                                >
                                  <p className="truncate text-[10px] font-semibold" style={{ color: cor }}>
                                    {primeirosNomes.map((m) => m.funcionario.nome.split(" ")[0]).join(", ")}
                                    {restantes > 0 && ` +${restantes}`}
                                  </p>
                                  <p className="truncate text-[9px] text-white/40">
                                    {formatarHora(g.inicioMin)}–{formatarHora(g.fimMin)}
                                  </p>
                                </button>

                                {expandido && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-white/10 bg-[#111318] p-1.5 shadow-xl"
                                  >
                                    <p className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide text-white/30">
                                      {formatarHora(g.inicioMin)}–{formatarHora(g.fimMin)} · {g.membros.length} pessoa(s)
                                    </p>
                                    {g.membros.map((m) => (
                                      <button
                                        key={m.funcionario.id}
                                        onClick={() => {
                                          setGrupoExpandido(null);
                                          onEditarFuncionario(m.funcionario);
                                        }}
                                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs text-white/80 hover:bg-white/[0.06]"
                                      >
                                        {m.turno.foraPreferencia && <AlertCircle className="h-3 w-3 shrink-0 text-[#F2C94C]" />}
                                        <span className="min-w-0">
                                          <span className="block truncate">{m.funcionario.nome}</span>
                                          <span className="block text-[10px] text-white/35">
                                            {resumoJornada(m.turno, m.funcionario.pausaAlmocoMinutos)}
                                          </span>
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[10px] text-white/25">
            <AlertCircle className="h-3 w-3 text-[#F2C94C]" />
            turno fora da preferência de período do colaborador · clique num bloco pra ver quem está nele
          </p>
        </>
      ) : (
        <>
          {/* ============================ MATRIZ ============================ */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.06]">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[200px_repeat(7,1fr)] border-b border-white/[0.06] bg-white/[0.02]">
                <div className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-white/30">
                  Colaborador · horas/semana
                </div>
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

              <div className="overflow-y-auto" style={{ maxHeight: ALTURA_MAXIMA_MATRIZ_PX }}>
                {gruposMatriz.map(({ zona, funcionarios: funcionariosDoGrupo }, idx) => (
                  <div key={zona?.id ?? "sem-zona"} className={idx !== gruposMatriz.length - 1 ? "border-b border-white/[0.06]" : ""}>
                    {zona && (
                      <div className="flex items-center gap-2 border-b border-white/[0.03] bg-white/[0.015] px-4 py-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zona.cor }} />
                        <span className="text-xs font-semibold uppercase tracking-wide text-white/60">{zona.nome}</span>
                      </div>
                    )}

                    {funcionariosDoGrupo.length === 0 && (
                      <div className="px-4 py-3 text-xs text-white/20">Nenhum funcionário nessa zona.</div>
                    )}

                    {funcionariosDoGrupo.map((f) => {
                      const sobrecarregado = f.horasSemana > f.cargaHorariaSemanalMax;
                      return (
                        <div
                          key={f.id}
                          className="grid grid-cols-[200px_repeat(7,1fr)] border-b border-white/[0.03] last:border-b-0"
                        >
                          <button
                            onClick={() => onEditarFuncionario(f)}
                            className="flex flex-col items-start gap-1 px-4 py-3 text-left transition hover:bg-white/[0.03]"
                          >
                            <span className="truncate text-sm font-medium text-white/90">{f.nome}</span>
                            <span className="truncate text-[10px] text-white/35">{f.cargo}</span>
                            <span
                              className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                sobrecarregado ? "bg-[#E5484D]/15 text-[#E5484D]" : "bg-white/[0.06] text-white/50"
                              }`}
                            >
                              {f.horasSemana}h / {f.cargaHorariaSemanalMax}h
                            </span>
                          </button>

                          {dias.map((_, diaIdx) => {
                            const turno = turnoPorFuncionarioDia.get(`${f.id}:${diaIdx}`);
                            const aberto = diasFuncionamento.includes(diaIdx);
                            return (
                              <div
                                key={diaIdx}
                                className={`flex min-h-[56px] items-center justify-center border-l border-white/[0.03] p-1.5 ${
                                  !aberto ? "bg-white/[0.008]" : ""
                                }`}
                              >
                                {!aberto ? (
                                  <span className="text-[10px] text-white/10">Fechado</span>
                                ) : turno ? (
                                  <button
                                    onClick={() => onEditarFuncionario(f)}
                                    className="flex flex-col items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 transition hover:border-white/15 hover:bg-white/[0.05]"
                                  >
                                    <span className="flex items-center gap-1 text-xs font-semibold text-white/85">
                                      {turno.foraPreferencia && <AlertCircle className="h-2.5 w-2.5 text-[#F2C94C]" />}
                                      {turno.horaInicio}–{turno.horaFim}
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-white/15">—</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
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
