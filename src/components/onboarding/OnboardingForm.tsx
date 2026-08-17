"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  salvarConfiguracaoOperacional,
  type OnboardingState,
} from "@/app/onboarding/actions";
import type {
  HorarioFuncionamento,
  MovimentoOperacional,
  NecessidadeEquipe,
  NivelMovimento,
  PeriodoOperacional,
  Zona,
} from "@/types/dominio";
import {
  NIVEIS_MOVIMENTO,
  LABEL_NIVEL_MOVIMENTO,
  PERIODOS_OPERACIONAIS,
} from "@/types/dominio";

const DIAS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const estadoInicial: OnboardingState = {};

const CORES_NIVEL: Record<
  NivelMovimento,
  { ativo: string; label: string }
> = {
  baixo: {
    ativo: "border-white/30 bg-white/15 text-white",
    label: "B",
  },
  normal: {
    ativo: "border-[#3EC6B9]/50 bg-[#3EC6B9]/20 text-[#3EC6B9]",
    label: "N",
  },
  alto: {
    ativo: "border-[#E8A33D]/50 bg-[#E8A33D]/20 text-[#E8A33D]",
    label: "A",
  },
  muito_alto: {
    ativo: "border-[#E5484D]/50 bg-[#E5484D]/20 text-[#E5484D]",
    label: "MA",
  },
};

function chaveMovimento(dia: number, periodo: PeriodoOperacional) {
  return `${dia}|${periodo}`;
}

interface LinhaNecessidade {
  _id: string;
  diaSemana: number;
  periodo: PeriodoOperacional;
  zonaId: string;
  funcao: string;
  minimo: number;
  ideal: number;
  maximo: number;
}

interface OnboardingFormProps {
  zonas: Zona[];
  cargosExistentes: string[];
  horariosExistentes: HorarioFuncionamento[];
  coberturaFdsExistente: boolean;
  movimentosExistentes: MovimentoOperacional[];
  necessidadesExistentes: NecessidadeEquipe[];
}

export function OnboardingForm({
  zonas,
  cargosExistentes,
  horariosExistentes,
  coberturaFdsExistente,
  movimentosExistentes,
  necessidadesExistentes,
}: OnboardingFormProps) {
  const [state, formAction, pending] = useActionState(
    salvarConfiguracaoOperacional,
    estadoInicial
  );

  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const datalistId = useId();

  const [diasAbertos, setDiasAbertos] = useState<boolean[]>(() =>
    Array.from({ length: 7 }, (_, dia) => {
      const existente = horariosExistentes.find(
        (h) => h.diaSemana === dia
      );
      return existente ? !existente.fechado : true;
    })
  );

  const [movimento, setMovimento] = useState<
    Map<string, NivelMovimento>
  >(
    () =>
      new Map(
        movimentosExistentes.map((m) => [
          chaveMovimento(m.diaSemana, m.periodo),
          m.nivel,
        ])
      )
  );

  const [necessidades, setNecessidades] = useState<LinhaNecessidade[]>(
    () =>
      necessidadesExistentes.map((n, index) => ({
        _id: `existente-${index}`,
        diaSemana: n.diaSemana,
        periodo: n.periodo,
        zonaId: n.zonaId ?? "",
        funcao: n.funcao ?? "",
        minimo: n.minimo,
        ideal: n.ideal,
        maximo: n.maximo,
      }))
  );

  const diasAbertosIndices = useMemo(
    () => diasAbertos.flatMap((aberto, dia) => (aberto ? [dia] : [])),
    [diasAbertos]
  );

  function alternarNivel(
    dia: number,
    periodo: PeriodoOperacional,
    nivel: NivelMovimento
  ) {
    setMovimento((atual) => {
      const proximo = new Map(atual);
      const chave = chaveMovimento(dia, periodo);

      if (proximo.get(chave) === nivel) {
        proximo.delete(chave);
      } else {
        proximo.set(chave, nivel);
      }

      return proximo;
    });
  }

  function adicionarLinhaNecessidade() {
    const primeiroDiaAberto = diasAbertosIndices[0] ?? 0;

    setNecessidades((atual) => [
      ...atual,
      {
        _id: `nova-${Date.now()}-${Math.random()}`,
        diaSemana: primeiroDiaAberto,
        periodo: "Abertura",
        zonaId: "",
        funcao: "",
        minimo: 1,
        ideal: 1,
        maximo: 1,
      },
    ]);
  }

  function atualizarLinhaNecessidade(
    id: string,
    campo: keyof LinhaNecessidade,
    valor: string | number
  ) {
    setNecessidades((atual) =>
      atual.map((linha) =>
        linha._id === id ? { ...linha, [campo]: valor } : linha
      )
    );
  }

  function removerLinhaNecessidade(id: string) {
    setNecessidades((atual) => atual.filter((linha) => linha._id !== id));
  }

  /*
   * O formulário usa camelCase internamente (diaSemana), mas a Server
   * Action recebe o formato persistido no banco (dia_semana).
   *
   * É importante fazer essa conversão aqui para que o payload enviado
   * pelo FormData tenha exatamente o formato esperado pela Action.
   */
  const movimentosPayload = useMemo(() => {
    const payload: {
      dia_semana: number;
      periodo: PeriodoOperacional;
      nivel: NivelMovimento;
    }[] = [];

    movimento.forEach((nivel, chave) => {
      const [diaTexto, periodo] = chave.split("|");

      payload.push({
        dia_semana: Number(diaTexto),
        periodo: periodo as PeriodoOperacional,
        nivel,
      });
    });

    return payload;
  }, [movimento]);

  const necessidadesPayload = useMemo(
    () =>
      necessidades.map((linha) => ({
        dia_semana: linha.diaSemana,
        periodo: linha.periodo,
        zona_id: linha.zonaId || null,
        funcao: linha.funcao.trim() || null,
        minimo: Number(linha.minimo),
        ideal: Number(linha.ideal),
        maximo: Number(linha.maximo),
      })),
    [necessidades]
  );

  function validarAntesDeEnviar(): string | null {
    if (diasAbertosIndices.length === 0) {
      return "Selecione pelo menos um dia de funcionamento.";
    }

    for (const linha of necessidades) {
      if (
        !Number.isFinite(linha.minimo) ||
        !Number.isFinite(linha.ideal) ||
        !Number.isFinite(linha.maximo) ||
        linha.minimo < 0 ||
        linha.ideal < linha.minimo ||
        linha.maximo < linha.ideal
      ) {
        return "Em Necessidade de equipa, confira se mínimo ≤ ideal ≤ máximo em todas as linhas.";
      }
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-[#0b0d10] px-4 py-10 text-[#f1f0ec]">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
            Configuração inicial
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Configure o funcionamento do restaurante
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
            Estas informações definem a base operacional do restaurante.
            O gerador de escalas vai usar este contexto para tomar
            decisões mais inteligentes — mas por enquanto só estamos
            recolhendo os dados.
          </p>
        </div>

        <form
          action={formAction}
          onSubmit={(e) => {
            const erro = validarAntesDeEnviar();
            if (erro) {
              e.preventDefault();
              setErroLocal(erro);
              return;
            }
            setErroLocal(null);
          }}
          className="space-y-6"
        >
          <input
            type="hidden"
            name="movimentosOperacionais"
            value={JSON.stringify(movimentosPayload)}
            readOnly
          />

          <input
            type="hidden"
            name="necessidadesEquipe"
            value={JSON.stringify(necessidadesPayload)}
            readOnly
          />

          <datalist id={datalistId}>
            {cargosExistentes.map((cargo) => (
              <option key={cargo} value={cargo} />
            ))}
          </datalist>

          {/* DIAS E HORÁRIOS */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-white">
                Dias e horários de funcionamento
              </h2>

              <p className="mt-1 text-sm leading-5 text-white/40">
                Indique em que dias o restaurante funciona e quais são os
                horários reais de abertura e fechamento.
              </p>
            </div>

            <div className="space-y-2">
              {DIAS.map((dia, index) => {
                const existente = horariosExistentes.find(
                  (h) => h.diaSemana === index
                );

                return (
                  <div
                    key={dia}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <label className="flex min-w-[140px] items-center gap-3">
                        <input
                          type="checkbox"
                          name={`aberto-${index}`}
                          checked={diasAbertos[index]}
                          onChange={(e) =>
                            setDiasAbertos((atual) => {
                              const proximo = [...atual];
                              proximo[index] = e.target.checked;
                              return proximo;
                            })
                          }
                          className="h-4 w-4 accent-[#E8A33D]"
                        />

                        <span className="text-sm font-medium text-white">
                          {dia}
                        </span>
                      </label>

                      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                        <div>
                          <label
                            htmlFor={`abertura-${index}`}
                            className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/30"
                          >
                            Abertura
                          </label>

                          <input
                            id={`abertura-${index}`}
                            type="time"
                            name={`abertura-${index}`}
                            defaultValue={existente?.horaAbertura ?? ""}
                            disabled={!diasAbertos[index]}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[#E8A33D]/50 disabled:opacity-30"
                          />
                        </div>

                        <span className="hidden text-xs text-white/25 sm:block">
                          até
                        </span>

                        <div>
                          <label
                            htmlFor={`fechamento-${index}`}
                            className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/30"
                          >
                            Fechamento
                          </label>

                          <input
                            id={`fechamento-${index}`}
                            type="time"
                            name={`fechamento-${index}`}
                            defaultValue={existente?.horaFechamento ?? ""}
                            disabled={!diasAbertos[index]}
                            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[#E8A33D]/50 disabled:opacity-30"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* COBERTURA FDS */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-white">
                Cobertura de fim de semana
              </h2>

              <p className="mt-1 text-sm leading-5 text-white/40">
                Esta preferência será utilizada pelo sistema posteriormente
                ao distribuir a cobertura do fim de semana.
              </p>
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div>
                <p className="text-sm font-medium text-white">
                  Priorizar cobertura de fim de semana
                </p>

                <p className="mt-1 text-xs leading-5 text-white/40">
                  Indica que sábado e domingo devem receber atenção especial
                  durante a geração das escalas.
                </p>
              </div>

              <input
                type="checkbox"
                name="coberturaFdsPrioritaria"
                defaultChecked={coberturaFdsExistente}
                className="mt-1 h-4 w-4 shrink-0 accent-[#E8A33D]"
              />
            </label>
          </section>

          {/* MOVIMENTO */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-white">
                Movimento esperado
              </h2>

              <p className="mt-1 text-sm leading-5 text-white/40">
                Para cada dia e período do dia, indique o movimento
                habitual. Os períodos são conceitos operacionais — não
                horários fixos. Deixe em branco o que não souber ainda.
              </p>
            </div>

            {diasAbertosIndices.length === 0 ? (
              <p className="text-sm text-white/30">
                Selecione dias de funcionamento acima para configurar o
                movimento esperado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5 text-sm">
                  <thead>
                    <tr>
                      <th className="w-28 text-left text-[11px] font-medium uppercase tracking-wide text-white/30">
                        Dia
                      </th>
                      {PERIODOS_OPERACIONAIS.map((periodo) => (
                        <th
                          key={periodo}
                          className="text-left text-[11px] font-medium uppercase tracking-wide text-white/30"
                        >
                          {periodo}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {diasAbertosIndices.map((dia) => (
                      <tr key={dia}>
                        <td className="rounded-l-lg bg-white/[0.02] px-3 py-2 text-sm font-medium text-white">
                          {DIAS[dia]}
                        </td>

                        {PERIODOS_OPERACIONAIS.map((periodo, pIndex) => {
                          const chave = chaveMovimento(dia, periodo);
                          const nivelAtual = movimento.get(chave);
                          const ultima =
                            pIndex === PERIODOS_OPERACIONAIS.length - 1;

                          return (
                            <td
                              key={periodo}
                              className={`bg-white/[0.02] px-2 py-2 ${
                                ultima ? "rounded-r-lg" : ""
                              }`}
                            >
                              <div className="flex gap-1">
                                {NIVEIS_MOVIMENTO.map((nivel) => {
                                  const ativo = nivelAtual === nivel;
                                  const cores = CORES_NIVEL[nivel];

                                  return (
                                    <button
                                      key={nivel}
                                      type="button"
                                      title={LABEL_NIVEL_MOVIMENTO[nivel]}
                                      onClick={() =>
                                        alternarNivel(dia, periodo, nivel)
                                      }
                                      className={`rounded-md border px-1.5 py-1 text-[10px] font-semibold transition ${
                                        ativo
                                          ? cores.ativo
                                          : "border-white/10 bg-transparent text-white/25 hover:text-white/50"
                                      }`}
                                    >
                                      {cores.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* NECESSIDADE DE EQUIPA */}
          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-white">
                Necessidade de equipa
              </h2>

              <p className="mt-1 text-sm leading-5 text-white/40">
                Quantas pessoas são necessárias (mínimo, ideal, máximo) por
                dia e período. Zona e função são opcionais — deixe em
                branco para &ldquo;qualquer zona&rdquo; ou &ldquo;qualquer
                função&rdquo;.
              </p>
            </div>

            <div className="space-y-3">
              {necessidades.map((linha) => (
                <div
                  key={linha._id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 lg:grid-cols-12">
                    <Campo label="Dia" className="sm:col-span-3 lg:col-span-2">
                      <select
                        value={linha.diaSemana}
                        onChange={(e) =>
                          atualizarLinhaNecessidade(
                            linha._id,
                            "diaSemana",
                            Number(e.target.value)
                          )
                        }
                        style={{ colorScheme: "dark" }}
                        className={estiloInput}
                      >
                        {diasAbertosIndices.map((dia) => (
                          <option key={dia} value={dia}>
                            {DIAS[dia]}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Período" className="sm:col-span-3 lg:col-span-2">
                      <select
                        value={linha.periodo}
                        onChange={(e) =>
                          atualizarLinhaNecessidade(
                            linha._id,
                            "periodo",
                            e.target.value
                          )
                        }
                        style={{ colorScheme: "dark" }}
                        className={estiloInput}
                      >
                        {PERIODOS_OPERACIONAIS.map((periodo) => (
                          <option key={periodo} value={periodo}>
                            {periodo}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Zona" className="sm:col-span-3 lg:col-span-2">
                      <select
                        value={linha.zonaId}
                        onChange={(e) =>
                          atualizarLinhaNecessidade(
                            linha._id,
                            "zonaId",
                            e.target.value
                          )
                        }
                        style={{ colorScheme: "dark" }}
                        className={estiloInput}
                      >
                        <option value="">Qualquer zona</option>
                        {zonas.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.nome}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Função" className="sm:col-span-3 lg:col-span-2">
                      <input
                        list={datalistId}
                        value={linha.funcao}
                        onChange={(e) =>
                          atualizarLinhaNecessidade(
                            linha._id,
                            "funcao",
                            e.target.value
                          )
                        }
                        placeholder="Qualquer função"
                        className={estiloInput}
                      />
                    </Campo>

                    <Campo label="Mín. / Ideal / Máx." className="col-span-2 sm:col-span-5 lg:col-span-3">
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min={0}
                          value={linha.minimo}
                          onChange={(e) =>
                            atualizarLinhaNecessidade(
                              linha._id,
                              "minimo",
                              Number(e.target.value)
                            )
                          }
                          className={estiloInput}
                        />
                        <input
                          type="number"
                          min={0}
                          value={linha.ideal}
                          onChange={(e) =>
                            atualizarLinhaNecessidade(
                              linha._id,
                              "ideal",
                              Number(e.target.value)
                            )
                          }
                          className={estiloInput}
                        />
                        <input
                          type="number"
                          min={0}
                          value={linha.maximo}
                          onChange={(e) =>
                            atualizarLinhaNecessidade(
                              linha._id,
                              "maximo",
                              Number(e.target.value)
                            )
                          }
                          className={estiloInput}
                        />
                      </div>
                    </Campo>

                    <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removerLinhaNecessidade(linha._id)}
                        className="rounded-lg p-2 text-white/30 transition hover:bg-[#E5484D]/10 hover:text-[#E5484D]"
                        title="Remover linha"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {necessidades.length === 0 && (
                <p className="text-sm text-white/30">
                  Nenhuma necessidade configurada ainda.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={adicionarLinhaNecessidade}
              disabled={diasAbertosIndices.length === 0}
              className="mt-4 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 transition hover:border-[#E8A33D]/40 hover:text-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar linha
            </button>
          </section>

          {/* INFORMAÇÃO SOBRE PRÓXIMAS CONFIGURAÇÕES */}
          <section className="rounded-2xl border border-[#E8A33D]/10 bg-[#E8A33D]/[0.03] p-6">
            <h2 className="text-sm font-semibold text-white">
              O que vem a seguir
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/45">
              Estes dados — movimento, necessidade de equipa, zonas e
              funções — vão alimentar o futuro gerador automático de
              escalas, junto com disponibilidade, carga horária, folgas e
              as demais regras. Por enquanto, esta página só recolhe e
              guarda a configuração.
            </p>
          </section>

          {/* ERRO */}
          {(erroLocal || state?.erro) && (
            <div className="rounded-xl border border-[#E5484D]/20 bg-[#E5484D]/[0.06] px-4 py-3">
              <p className="text-sm text-[#E5484D]">
                {erroLocal ?? state?.erro}
              </p>
            </div>
          )}

          {/* BOTÃO */}
          <div className="flex justify-end border-t border-white/[0.06] pt-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-gradient-to-b from-[#E8A33D] to-[#d1902f] px-6 py-3 text-sm font-semibold text-[#1a1206] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "A guardar..." : "Guardar configuração"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

const estiloInput =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white outline-none focus:border-[#E8A33D]/50";

function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-white/30">
        {label}
      </label>
      {children}
    </div>
  );
}
