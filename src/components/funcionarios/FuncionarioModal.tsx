"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { salvarFuncionario, desativarFuncionario, type FuncionarioFormState } from "@/app/(dashboard)/funcionarios/actions";
import type { Funcionario, Periodo, Zona } from "@/types/dominio";
import { PERIODOS } from "@/types/dominio";

interface FuncionarioModalProps {
  funcionario: Funcionario | null; // null = criando um novo
  zonas: Zona[];
  usaZonas: boolean;
  onFechar: () => void;
}

const estadoInicial: FuncionarioFormState = {};

export function FuncionarioModal({ funcionario, zonas, usaZonas, onFechar }: FuncionarioModalProps) {
  const [state, formAction, pending] = useActionState(salvarFuncionario, estadoInicial);
  const [removendo, setRemovendo] = useState(false);

  // Fechar o modal é uma mudança de estado do componente PAI
  // (PainelEscalas). Chamar onFechar() direto no corpo do componente
  // dispara isso durante o render do FuncionarioModal, o que o React
  // proíbe ("Cannot update a component while rendering a different
  // component"). useEffect roda depois do render, então é seguro.
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
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50 disabled:opacity-40"
              >
                <option value="">Sem zona fixa</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nome}
                  </option>
                ))}
              </select>
              {usaZonas && zonas.length > 0 && (
                <p className="mt-1 text-[10px] text-white/30">
                  Sem escolher uma zona aqui, este colaborador nunca vai ser elegível pra "Gerar escala
                  automaticamente" nas zonas cadastradas.
                </p>
              )}
            </div>

            <Campo label="Idade" name="idade" type="number" defaultValue={funcionario?.idade ?? undefined} />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">Gênero</label>
              <select
                name="genero"
                defaultValue={funcionario?.genero ?? ""}
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
              defaultValue={funcionario?.cargaHorariaSemanalMax ?? 44}
            />
            <Campo
              label="Folgas obrigatórias/semana"
              name="folgasObrigatorias"
              type="number"
              defaultValue={funcionario?.folgasObrigatorias ?? 2}
            />
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
  required,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-white/50">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#E8A33D]/50"
      />
    </div>
  );
}