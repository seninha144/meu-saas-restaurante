export const DESCANSO_MINIMO_MINUTOS = 11 * 60;
export const MAXIMO_DIAS_CONSECUTIVOS = 6;
const PRIORIDADE_COBERTURA_MINIMA = 1000;

export interface JornadaAbsoluta {
  inicio: number;
  fim: number;
}

export type ResponsabilidadeOperacional = "abertura" | "fechamento";

export function podeAssumirResponsabilidade(
  podeAbertura: boolean,
  podeFechamento: boolean,
  responsabilidade: ResponsabilidadeOperacional
): boolean {
  return responsabilidade === "abertura" ? podeAbertura : podeFechamento;
}

export function obterFalhasNasExtremidades(
  turnos: {
    periodo: string;
    horaInicio: string | null;
    horaFim: string | null;
    podeAbertura: boolean;
    podeFechamento: boolean;
  }[],
  abertura: string,
  fechamento: string
): ResponsabilidadeOperacional[] {
  const aberturaCoberta = turnos.some(
    (turno) =>
      turno.periodo === "Manhã" &&
      turno.horaInicio?.slice(0, 5) === abertura.slice(0, 5) &&
      turno.podeAbertura
  );
  const fechamentoCoberto = turnos.some(
    (turno) =>
      turno.periodo === "Fechamento" &&
      turno.horaFim?.slice(0, 5) === fechamento.slice(0, 5) &&
      turno.podeFechamento
  );

  return [
    ...(aberturaCoberta ? [] : ["abertura" as const]),
    ...(fechamentoCoberto ? [] : ["fechamento" as const]),
  ];
}

export function calcularJornadaOperacional(
  abertura: number,
  fechamento: number,
  inicioPeriodo: number,
  duracaoMinutos: number,
  responsabilidade?: ResponsabilidadeOperacional
): JornadaAbsoluta {
  if (responsabilidade === "abertura") {
    return {
      inicio: abertura,
      fim: Math.min(fechamento, abertura + duracaoMinutos),
    };
  }

  if (responsabilidade === "fechamento") {
    return {
      inicio: Math.max(abertura, fechamento - duracaoMinutos),
      fim: fechamento,
    };
  }

  const inicio = Math.max(
    abertura,
    Math.min(inicioPeriodo, fechamento - duracaoMinutos)
  );
  return { inicio, fim: inicio + duracaoMinutos };
}

export function respeitaDescansoMinimo(
  existentes: JornadaAbsoluta[],
  nova: JornadaAbsoluta,
  descansoMinimo = DESCANSO_MINIMO_MINUTOS
): boolean {
  return existentes.every((jornada) => {
    if (nova.inicio >= jornada.fim) {
      return nova.inicio - jornada.fim >= descansoMinimo;
    }

    if (jornada.inicio >= nova.fim) {
      return jornada.inicio - nova.fim >= descansoMinimo;
    }

    return false;
  });
}

export function respeitaMaximoDiasConsecutivos(
  diasExistentes: Iterable<number>,
  novoDia: number,
  maximo = MAXIMO_DIAS_CONSECUTIVOS
): boolean {
  const dias = new Set(diasExistentes);
  dias.add(novoDia);

  let consecutivos = 1;
  for (let dia = novoDia - 1; dias.has(dia); dia--) consecutivos++;
  for (let dia = novoDia + 1; dias.has(dia); dia++) consecutivos++;

  return consecutivos <= maximo;
}

export function pontuarCoberturaDia(
  trabalhadores: number,
  minimo: number,
  ideal: number
): number {
  if (trabalhadores < minimo) {
    return (minimo - trabalhadores) * PRIORIDADE_COBERTURA_MINIMA;
  }

  return -(trabalhadores / Math.max(ideal, minimo, 1)) * 100;
}

export function normalizarFuncao(funcao: string): string {
  return funcao.trim().toLocaleLowerCase("pt-PT");
}

export function funcionarioAtendeFuncao(cargo: string, funcao: string): boolean {
  return normalizarFuncao(cargo) === normalizarFuncao(funcao);
}

export function agruparMinimosPorFuncao(
  necessidades: { funcao?: string | null; minimo: number }[]
): Map<string, number> {
  const resultado = new Map<string, number>();

  for (const necessidade of necessidades) {
    if (!necessidade.funcao?.trim()) continue;
    const funcao = normalizarFuncao(necessidade.funcao);
    resultado.set(funcao, (resultado.get(funcao) ?? 0) + Math.max(0, necessidade.minimo));
  }

  return resultado;
}
