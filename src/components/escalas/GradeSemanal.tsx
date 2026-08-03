"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, MessageCircle, Sparkles, Loader2 } from "lucide-react";
import { formatarDiaHeader } from "@/lib/dates";
import type { Funcionario, Turno, Zona } from "@/types/dominio";
import { GapAlerta } from "./GapAlerta";
import { gerarEscalaAutomatica } from "@/app/(dashboard)/escalas/actions";
import type { Alerta } from "@/types/dominio";

const HORAS_POR_TURNO = 8; // mesma estimativa usada no resto do projeto

interface GradeSemanalProps {
  escalaId: string;
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  alertas: Alerta[];
  dias: Date[];
  diasFuncionamento: number[]; // 0-6 — dias em que o restaurante abre
  onAbrirNovoFuncionario: () => void;
  onAbrirGestaoZonas: () => void;
  onEditarFuncionario: (funcionario: Funcionario) => void;
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

  const turnosPorFuncionarioDia = useMemo(() => {
    const map = new Map<string, Turno>(); // chave: `${funcionarioId}:${dia}`
    turnos.forEach((t) => map.set(`${t.funcionarioId}:${t.dia}`, t));
    return map;
  }, [turnos]);

  const horasSemanaPorFuncionario = useMemo(() => {
    const map = new Map<string, number>();
    funcionarios.forEach((f) => map.set(f.id, 0));
    turnos.forEach((t) => map.set(t.funcionarioId, (map.get(t.funcionarioId) ?? 0) + HORAS_POR_TURNO));
    return map;
  }, [funcionarios, turnos]);

  const grupos: { zona: Zona | null; funcionarios: Funcionario[] }[] = useMemo(() => {
    if (!usaZonas) {
      return [{ zona: null, funcionarios }];
    }
    const zonasFiltradas = zonaFiltro === "todas" ? zonas : zonas.filter((z) => z.id === zonaFiltro);
    return zonasFiltradas.map((zona) => ({
      zona,
      funcionarios: funcionarios.filter((f) => f.zonaId === zona.id),
    }));
  }, [usaZonas, zonas, zonaFiltro, funcionarios]);

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

      {/* ============================ GRADE ============================ */}
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

          {grupos.map(({ zona, funcionarios: funcionariosDoGrupo }, idx) => (
            <div key={zona?.id ?? "sem-zona"} className={idx !== grupos.length - 1 ? "border-b border-white/[0.06]" : ""}>
              {zona && (
                <div className="flex items-center gap-2 border-b border-white/[0.03] bg-white/[0.015] px-4 py-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zona.cor }} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/60">{zona.nome}</span>
                </div>
              )}

              {funcionariosDoGrupo.length === 0 && (
                <div className="px-4 py-3 text-xs text-white/20">Nenhum funcionário vinculado a esta zona.</div>
              )}

              {funcionariosDoGrupo.map((f) => {
                const horas = horasSemanaPorFuncionario.get(f.id) ?? 0;
                const sobrecarregado = horas > f.cargaHorariaSemanalMax;

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
                        {horas}h / {f.cargaHorariaSemanalMax}h
                      </span>
                    </button>

                    {dias.map((_, diaIdx) => {
                      const turno = turnosPorFuncionarioDia.get(`${f.id}:${diaIdx}`);
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
                              className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 transition hover:border-white/15 hover:bg-white/[0.05]"
                            >
                              <span className="text-sm font-semibold text-white/85">{HORAS_POR_TURNO}h</span>
                              <span className="text-[9px] text-white/35">{turno.periodo}</span>
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