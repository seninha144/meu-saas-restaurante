"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { X, Wallet, Check, Clock, Play, Square } from "lucide-react";
import {
  salvarFuncionario,
  desativarFuncionario,
  getResumoPagamentoAction,
  marcarComoPago,
  baterPonto,
  type FuncionarioFormState,
} from "@/app/(dashboard)/funcionarios/actions";
import type { Funcionario, Periodo, ResumoPagamento, Zona } from "@/types/dominio";
import { PERIODOS } from "@/types/dominio";

interface FuncionarioModalProps {
  funcionario: Funcionario | null;
  zonas: Zona[];
  usaZonas: boolean;
  onFechar: () => void;
}

const estadoInicial: FuncionarioFormState = {};

// Dá pra digitar um <select> nativo com o dropdown aberto ficando
// branco/ilegível no dark mode porque o navegador usa a paleta clara
// por padrão pro popup de opções, independente das classes Tailwind
// aplicadas ao elemento. `colorScheme: "dark"` avisa o navegador pra
// usar os controles nativos (inclusive o popup) na variante escura.
const selectDarkStyle = { colorScheme: "dark" as const };

export function FuncionarioModal({ funcionario, zonas, usaZonas, onFechar }: FuncionarioModalProps) {
  const [state, formAction, pending] = useActionState(salvarFuncionario, estadoInicial);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    if (state.sucesso) {
      onFechar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sucesso]);

  async function handleRemover() {
    if (!funcionario) return;
    setRemovendo(true);
    await desativarFuncionario(funcionario.id);
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111318] p-6 text-[#f1f0ec]">
        <div className="flex items-center justify-between">
          <h2 className="font-[Space_Grotesk,system-ui,sans-serif] text-lg font-semibold">
            {funcionario ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <button onClick={onFechar} className="text-white/40 hover:text-white/80">
            <X className="h-5 w-5" />
          </button>
        </div>

        {funcionario && <ResumoPagamentoCard funcionarioId={funcionario.id} />}

        <form action={formAction} className="mt-5 space-y-4">
          {funcionario && <input type="hidden" name="id" value={funcionario.id} />}

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome" name="nome" defaultValue={funcionario?.nome} required className="col-span-2" />
            <Campo label="Cargo" name="cargo" defaultValue={funcionario?.cargo} required />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">
                Zona {usaZonas && zonas.length > 0 && <span className="text-[#E8A33D]">*</span>}
              </label>
              <select
                name="zonaId"
                defaultValue={funcionario?.zonaId ?? ""}
                disabled={!usaZonas}
                style={selectDarkStyle}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50 disabled:opacity-40"
              >
                <option value="">Sem zona fixa</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nome}
                  </option>
                ))}
              </select>
            </div>

            <Campo label="Idade" name="idade" type="number" min="14" defaultValue={funcionario?.idade ?? undefined} />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">Gênero</label>
              <select
                name="genero"
                defaultValue={funcionario?.genero ?? ""}
                style={selectDarkStyle}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
              >
                <option value="">Prefiro não informar</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <Campo
              label="Carga horária semanal (h)"
              name="cargaHorariaSemanalMax"
              type="number"
              min="0"
              defaultValue={funcionario?.cargaHorariaSemanalMax ?? 44}
            />
            <Campo
              label="Folgas obrigatórias/semana"
              name="folgasObrigatorias"
              type="number"
              min="0"
              defaultValue={funcionario?.folgasObrigatorias ?? 2}
            />

            <Campo
              label="Valor/hora próprio (€, opcional)"
              name="valorHora"
              type="number"
              step="0.01"
              min="0"
              defaultValue={funcionario?.valorHora ?? undefined}
              placeholder="Herda do restaurante"
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">Frequência de pagamento</label>
              <select
                name="frequenciaPagamento"
                defaultValue={funcionario?.frequenciaPagamento ?? ""}
                style={selectDarkStyle}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
              >
                <option value="">Herdar do restaurante</option>
                <option value="dia">Diária</option>
                <option value="semana">Semanal</option>
                <option value="quinzena">Quinzenal</option>
                <option value="mes">Mensal</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-white/50">Pausa de almoço</label>
              <select
                name="pausaAlmocoMinutos"
                defaultValue={funcionario?.pausaAlmocoMinutos ?? 30}
                style={selectDarkStyle}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
              >
                <option value={0}>Sem pausa</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>1 hora</option>
              </select>
              <p className="mt-1 text-[10px] text-white/30">
                Descontada automaticamente das horas de cada turno com entrada e saída registradas.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-white/50">Disponibilidade / preferência de turnos</p>
            <GradeDisponibilidade funcionario={funcionario} />
          </div>

          {state.erro && <p className="text-sm text-[#E5484D]">{state.erro}</p>}

          <div className="flex items-center justify-between pt-2">
            {funcionario ? (
              <button
                type="button"
                onClick={handleRemover}
                disabled={removendo}
                className="text-sm font-medium text-[#E5484D]/80 hover:text-[#E5484D]"
              >
                {removendo ? "Removendo…" : "Remover colaborador"}
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-4 py-2 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:opacity-70"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResumoPagamentoCard({ funcionarioId }: { funcionarioId: string }) {
  const [resumo, setResumo] = useState<ResumoPagamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, startCarregando] = useTransition();
  const [marcando, startMarcando] = useTransition();
  const [batendo, startBatendo] = useTransition();

  function recarregar() {
    startCarregando(async () => {
      const resultado = await getResumoPagamentoAction(funcionarioId);
      if ("erro" in resultado) setErro(resultado.erro);
      else {
        setErro(null);
        setResumo(resultado);
      }
    });
  }

  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarioId]);

  // Enquanto o ponto está em aberto, o valor precisa "andar" sozinho —
  // recarrega a cada minuto pra refletir a hora que passou, sem
  // precisar a pessoa clicar em nada.
  useEffect(() => {
    if (!resumo?.pontoEmAberto) return;
    const intervalo = setInterval(recarregar, 60_000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo?.pontoEmAberto]);

  function handleMarcarPago() {
    startMarcando(async () => {
      const resultado = await marcarComoPago(funcionarioId);
      if (resultado.erro) setErro(resultado.erro);
      else recarregar();
    });
  }

  function handleBaterPonto() {
    startBatendo(async () => {
      const resultado = await baterPonto(funcionarioId);
      if (resultado.erro) setErro(resultado.erro);
      else recarregar();
    });
  }

  if (carregando && !resumo) {
    return <div className="mt-4 h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />;
  }

  if (!resumo) {
    return <p className="mt-4 text-xs text-white/30">Não foi possível calcular o resumo de pagamento.</p>;
  }

  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/40">
          <Wallet className="h-3.5 w-3.5" />
          Saldo desde {formatarDataHora(resumo.desde)}
        </div>
        <button
          type="button"
          onClick={handleBaterPonto}
          disabled={batendo}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
            resumo.pontoEmAberto
              ? "bg-[#E5484D]/15 text-[#E5484D] hover:bg-[#E5484D]/25"
              : "bg-[#3EC6B9]/15 text-[#3EC6B9] hover:bg-[#3EC6B9]/25"
          }`}
        >
          {resumo.pontoEmAberto ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {resumo.pontoEmAberto ? "Bater saída" : "Bater entrada"}
        </button>
      </div>

      <div className="mt-2 flex items-end justify-between">
        <div>
          <p className="text-2xl font-semibold">
            {resumo.valorTotal.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
          </p>
          <p className="flex items-center gap-1 text-xs text-white/40">
            {resumo.pontoEmAberto && <Clock className="h-3 w-3 animate-pulse text-[#3EC6B9]" />}
            {resumo.horasTrabalhadas}h × {resumo.valorHora.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}/h
            {resumo.pontoEmAberto && " · em andamento"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleMarcarPago}
          disabled={marcando || resumo.horasTrabalhadas === 0 || resumo.pontoEmAberto}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#3EC6B9] to-[#2ea89c] px-3 py-2 text-xs font-semibold text-[#04201d] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          title={resumo.pontoEmAberto ? "Feche o ponto em aberto antes de pagar" : undefined}
        >
          <Check className="h-3.5 w-3.5" />
          {marcando ? "Registrando…" : "Marcar como pago"}
        </button>
      </div>

      {erro && <p className="mt-2 text-xs text-[#E5484D]">{erro}</p>}
    </div>
  );
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

const DIAS_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function GradeDisponibilidade({ funcionario }: { funcionario: Funcionario | null }) {
  return (
    <div className="space-y-1.5">
      {DIAS_LABEL.map((label, dia) => {
        const disp = funcionario?.disponibilidade.find((d) => d.diaSemana === dia);
        const indisponivelPorPadrao = disp ? !disp.disponivel : false;

        return (
          <div key={dia} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <span className="w-9 shrink-0 text-xs font-medium text-white/60">{label}</span>

            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/40">
              <input
                type="checkbox"
                name={`indisponivel-${dia}`}
                defaultChecked={indisponivelPorPadrao}
                className="accent-[#E5484D]"
              />
              Indisponível
            </label>

            <div className="flex flex-wrap gap-1.5">
              {PERIODOS.map((periodo) => (
                <label
                  key={periodo}
                  className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50"
                >
                  <input
                    type="checkbox"
                    name={`disp-${dia}-${periodo}`}
                    defaultChecked={disp?.periodosPreferidos.includes(periodo as Periodo)}
                    className="accent-[#3EC6B9]"
                  />
                  {periodo}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  step,
  min,
  required,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  step?: string;
  min?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-white/50">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        onKeyDown={(e) => {
          // bloqueia o "-" na digitação em campos numéricos não-negativos
          if (min === "0" && e.key === "-") e.preventDefault();
        }}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
      />
    </div>
  );
}