import { paraMinutos } from "../horas.ts";
import { periodosAtravessados } from "./candidatos-turno.ts";
import { agregarHistoricoTurnos } from "./historico.ts";
import { hashDeterministico, type SolucaoSemanal } from "./solucao-semanal.ts";
import type { SnapshotSemanal } from "./snapshot-semanal.ts";
import type { MetricasSolucao, ResultadoValidacaoSolucao } from "./validar-solucao.ts";
import type { Periodo, PeriodoOperacional } from "../../types/dominio.ts";
import { horasExtrasPermitidas } from "./limite-carga-semanal.ts";
import { cargaAlvoPlanejavel } from "./carga-planejavel.ts";

const MINUTOS_DIA = 24 * 60;
const PERIODOS_OPERACIONAIS: PeriodoOperacional[] = ["Abertura", "Almoço", "Tarde", "Fechamento"];
const MAPA_PERIODO: Record<PeriodoOperacional, Periodo> = {
  Abertura: "Manhã",
  Almoço: "Tarde",
  Tarde: "Noite",
  Fechamento: "Fechamento",
};

export interface NivelCoberturaIdeal {
  custo: number;
  unidadesAbaixoIdeal: number;
  periodosAbaixoIdeal: number;
}

export interface NivelExcessoMaximo {
  custo: number;
  unidadesAcimaMaximo: number;
}

export interface NivelCarga {
  custo: number;
  desvioProporcionalMedio: number;
  desviosHoras: Record<string, number>;
}

export interface NivelHorasExtras {
  custo: number;
  horasExtrasUtilizadas: number;
  porFuncionario: Record<string, number>;
}

export interface NivelJustica {
  custo: number;
  desequilibrioEquipe: number;
  repeticoesSemanaAnterior: number;
}

export interface NivelPreferencias {
  custo: number;
  preferenciasNaoAtendidas: number;
  repeticoesExcessivasDePeriodo: number;
}

export interface AvaliacaoSolucao {
  solucaoId: string;
  valida: boolean;
  niveis: {
    coberturaIdeal: NivelCoberturaIdeal;
    excessoMaximo: NivelExcessoMaximo;
    horasExtras: NivelHorasExtras;
    carga: NivelCarga;
    justica: NivelJustica;
    preferencias: NivelPreferencias;
  };
  chaveComparacao: number[];
  desempateDeterministico: string;
  scoreExplicavel: {
    resumo: string[];
    metricasValidacao: MetricasSolucao;
  };
}

function media(valores: number[]) {
  return valores.length > 0 ? valores.reduce((total, valor) => total + valor, 0) / valores.length : 0;
}

function desvioMedio(valores: number[]) {
  const centro = media(valores);
  return media(valores.map((valor) => Math.abs(valor - centro)));
}

function arredondar(valor: number) {
  return Math.round(valor * 1_000_000) / 1_000_000;
}

function periodosDoTurno(snapshot: SnapshotSemanal, turno: SolucaoSemanal["turnos"][number]) {
  const horario = snapshot.horarios.find((item) => item.diaSemana === turno.diaSemana);
  if (!horario) return [];
  const operacaoInicio = paraMinutos(horario.abertura);
  const operacaoFimBase = paraMinutos(horario.fechamento);
  const operacaoFim = operacaoFimBase <= operacaoInicio ? operacaoFimBase + MINUTOS_DIA : operacaoFimBase;
  let inicio = paraMinutos(turno.horaInicio);
  if (operacaoFim > MINUTOS_DIA && inicio < operacaoInicio) inicio += MINUTOS_DIA;
  let fim = paraMinutos(turno.horaFim);
  while (fim <= inicio) fim += MINUTOS_DIA;
  return periodosAtravessados(horario, inicio, fim);
}

function calcularNivelCarga(
  snapshot: SnapshotSemanal,
  metricas: MetricasSolucao
): NivelCarga {
  const desviosHoras: Record<string, number> = {};
  const proporcionais = snapshot.funcionarios.map((funcionario) => {
    const realizadas = metricas.horasPorFuncionario[funcionario.id] ?? 0;
    const alvo = cargaAlvoPlanejavel(snapshot, funcionario);
    const desvio = realizadas - alvo;
    desviosHoras[funcionario.id] = Math.round(desvio * 100) / 100;
    return Math.abs(desvio) / Math.max(1, alvo);
  });
  const custo = arredondar(media(proporcionais));
  return { custo, desvioProporcionalMedio: custo, desviosHoras };
}

function calcularNivelHorasExtras(
  snapshot: SnapshotSemanal,
  metricas: MetricasSolucao
): NivelHorasExtras {
  const porFuncionario: Record<string, number> = {};
  let total = 0;
  for (const funcionario of snapshot.funcionarios) {
    const realizadas = metricas.horasPorFuncionario[funcionario.id] ?? 0;
    const extras = Math.max(0, realizadas - funcionario.cargaHorariaSemanalMax);
    const permitidas = horasExtrasPermitidas(snapshot.restaurante, funcionario);
    const utilizadas = Math.min(extras, permitidas);
    porFuncionario[funcionario.id] = arredondar(utilizadas);
    total += utilizadas;
  }
  return {
    custo: arredondar(total),
    horasExtrasUtilizadas: arredondar(total),
    porFuncionario,
  };
}

function calcularNivelJustica(
  snapshot: SnapshotSemanal,
  solucao: SolucaoSemanal,
  metricas: MetricasSolucao
): NivelJustica {
  const ids = snapshot.funcionarios.map((funcionario) => funcionario.id);
  const historico = agregarHistoricoTurnos(
    snapshot.historicoQuatroSemanas,
    snapshot.semana.inicio,
    ids
  );
  const projetadas = new Map(
    ids.map((id) => {
      const anterior = historico.get(id)!;
      return [id, {
        aberturas: anterior.aberturas + (metricas.aberturasPorFuncionario[id] ?? 0),
        fechamentos: anterior.fechamentos + (metricas.fechamentosPorFuncionario[id] ?? 0),
        sabados: anterior.sabadosTrabalhados,
        domingos: anterior.domingosTrabalhados,
        finsDeSemana: anterior.finsDeSemanaCompletos,
        periodos: { ...anterior.turnosPorPeriodo },
        horas: anterior.horasPlanejadas + (metricas.horasPorFuncionario[id] ?? 0),
        padraoAnterior: new Set(anterior.padraoSemanaAnterior),
      }];
    })
  );

  let repeticoesSemanaAnterior = 0;
  for (const turno of solucao.turnos) {
    const item = projetadas.get(turno.funcionarioId);
    if (!item) continue;
    const periodos = periodosDoTurno(snapshot, turno);
    for (const operacional of periodos) {
      const periodo = MAPA_PERIODO[operacional];
      item.periodos[periodo]++;
      if (item.padraoAnterior.has(`${turno.diaSemana}:${periodo}`)) repeticoesSemanaAnterior++;
    }
    if (turno.diaSemana === 5) item.sabados++;
    if (turno.diaSemana === 6) item.domingos++;
  }

  for (const funcionarioId of ids) {
    const dias = new Set(
      solucao.turnos
        .filter((turno) => turno.funcionarioId === funcionarioId)
        .map((turno) => turno.diaSemana)
    );
    if (dias.has(5) && dias.has(6)) projetadas.get(funcionarioId)!.finsDeSemana++;
  }

  const normalizados = snapshot.funcionarios.map((funcionario) => {
    const item = projetadas.get(funcionario.id)!;
    const fator = Math.max(1, funcionario.cargaHorariaSemanalMax) / 40;
    return {
      aberturas: item.aberturas / fator,
      fechamentos: item.fechamentos / fator,
      sabados: item.sabados / fator,
      domingos: item.domingos / fator,
      finsDeSemana: item.finsDeSemana / fator,
      horas: item.horas / Math.max(1, funcionario.cargaHorariaSemanalMax * 5),
      periodos: PERIODOS_OPERACIONAIS.map((periodo) => item.periodos[MAPA_PERIODO[periodo]] / fator),
    };
  });

  const desequilibrioEquipe = arredondar(
    desvioMedio(normalizados.map((item) => item.aberturas)) +
      desvioMedio(normalizados.map((item) => item.fechamentos)) +
      desvioMedio(normalizados.map((item) => item.sabados)) +
      desvioMedio(normalizados.map((item) => item.domingos)) +
      desvioMedio(normalizados.map((item) => item.finsDeSemana)) +
      desvioMedio(normalizados.map((item) => item.horas)) +
      PERIODOS_OPERACIONAIS.reduce(
        (total, _, indice) => total + desvioMedio(normalizados.map((item) => item.periodos[indice])),
        0
      )
  );
  const custo = arredondar(desequilibrioEquipe + repeticoesSemanaAnterior);
  return { custo, desequilibrioEquipe, repeticoesSemanaAnterior };
}

function calcularNivelPreferencias(
  snapshot: SnapshotSemanal,
  solucao: SolucaoSemanal
): NivelPreferencias {
  let preferenciasNaoAtendidas = 0;
  const contagemPeriodos = new Map<string, number>();

  for (const turno of solucao.turnos) {
    const periodos = periodosDoTurno(snapshot, turno);
    const preferidos = snapshot.disponibilidades
      .filter(
        (item) =>
          item.funcionarioId === turno.funcionarioId &&
          item.diaSemana === turno.diaSemana &&
          item.disponivel &&
          item.periodo
      )
      .map((item) => item.periodo);
    const periodosLegados = periodos.map((periodo) => MAPA_PERIODO[periodo]);
    if (preferidos.length > 0 && !periodosLegados.some((periodo) => preferidos.includes(periodo))) {
      preferenciasNaoAtendidas++;
    }
    for (const periodo of periodos) {
      const chave = `${turno.funcionarioId}:${periodo}`;
      contagemPeriodos.set(chave, (contagemPeriodos.get(chave) ?? 0) + 1);
    }
  }

  const repeticoesExcessivasDePeriodo = [...contagemPeriodos.values()].reduce(
    (total, quantidade) => total + Math.max(0, quantidade - 1),
    0
  );
  const custo = preferenciasNaoAtendidas + repeticoesExcessivasDePeriodo;
  return { custo, preferenciasNaoAtendidas, repeticoesExcessivasDePeriodo };
}

function desempate(solucao: SolucaoSemanal) {
  const hash = hashDeterministico(`${solucao.semana.inicio}:${solucao.id}:${solucao.turnos.map((turno) => turno.id).join("|")}`);
  return { hash, numero: Number.parseInt(hash, 16) / 0xffffffff };
}

export function avaliarSolucao(
  snapshot: SnapshotSemanal,
  solucao: SolucaoSemanal,
  validacao: ResultadoValidacaoSolucao
): AvaliacaoSolucao {
  const coberturaIdeal: NivelCoberturaIdeal = {
    custo: validacao.metricas.distanciaParaIdeal,
    unidadesAbaixoIdeal: validacao.metricas.distanciaParaIdeal,
    periodosAbaixoIdeal: validacao.avisos.filter((aviso) => aviso.codigo === "ABAIXO_IDEAL").length,
  };
  const excessoMaximo: NivelExcessoMaximo = {
    custo: validacao.metricas.excessoAcimaMaximo,
    unidadesAcimaMaximo: validacao.metricas.excessoAcimaMaximo,
  };
  const horasExtras = calcularNivelHorasExtras(snapshot, validacao.metricas);
  const carga = calcularNivelCarga(snapshot, validacao.metricas);
  const justica = calcularNivelJustica(snapshot, solucao, validacao.metricas);
  const preferencias = calcularNivelPreferencias(snapshot, solucao);
  const tie = desempate(solucao);
  const chaveComparacao = validacao.valida
    ? [0, coberturaIdeal.custo, excessoMaximo.custo, horasExtras.custo, carga.custo, justica.custo, preferencias.custo, tie.numero]
    : [1, validacao.erros.length, tie.numero];

  const resumo = validacao.valida
    ? [
        `${coberturaIdeal.unidadesAbaixoIdeal} unidade(s) abaixo do ideal em ${coberturaIdeal.periodosAbaixoIdeal} período(s).`,
        `${excessoMaximo.unidadesAcimaMaximo} unidade(s) acima do máximo.`,
        `${horasExtras.horasExtrasUtilizadas}h extra(s) utilizadas.`,
        `Desvio proporcional médio de carga: ${Math.round(carga.desvioProporcionalMedio * 10000) / 100}%.`,
        `Desequilíbrio histórico projetado: ${justica.desequilibrioEquipe}.`,
        `${preferencias.preferenciasNaoAtendidas} preferência(s) não atendida(s).`,
      ]
    : [`Solução inválida: ${validacao.erros.length} hard constraint(s) violada(s).`];

  return {
    solucaoId: solucao.id,
    valida: validacao.valida,
    niveis: { coberturaIdeal, excessoMaximo, horasExtras, carga, justica, preferencias },
    chaveComparacao,
    desempateDeterministico: tie.hash,
    scoreExplicavel: { resumo, metricasValidacao: validacao.metricas },
  };
}

/** Retorna valor negativo quando A é melhor, positivo quando B é melhor. */
export function compararAvaliacoes(a: AvaliacaoSolucao, b: AvaliacaoSolucao): number {
  const tamanho = Math.max(a.chaveComparacao.length, b.chaveComparacao.length);
  for (let indice = 0; indice < tamanho; indice++) {
    const valorA = a.chaveComparacao[indice] ?? 0;
    const valorB = b.chaveComparacao[indice] ?? 0;
    if (valorA !== valorB) return valorA - valorB;
  }
  return a.desempateDeterministico.localeCompare(b.desempateDeterministico);
}
