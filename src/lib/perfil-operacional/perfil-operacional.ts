import {
  NIVEIS_MOVIMENTO,
  PERIODOS_OPERACIONAIS,
  type MovimentoOperacional,
  type NivelMovimento,
  type PeriodoOperacional,
} from "../../types/dominio.ts";

export interface MovimentoOperacionalPayload {
  dia_semana: number;
  periodo: PeriodoOperacional;
  nivel: NivelMovimento;
}

export interface NecessidadeEquipePayload {
  dia_semana: number;
  periodo: PeriodoOperacional;
  zona_id: string | null;
  funcao: string | null;
  minimo: number;
  ideal: number;
  maximo: number;
}

export interface HorarioOperacionalPayload {
  dia_semana: number;
  fechado: boolean;
  hora_abertura: string | null;
  hora_fechamento: string | null;
}

export interface PerfilOperacionalPayload {
  diasFuncionamento: number[];
  horarios: HorarioOperacionalPayload[];
  coberturaFdsPrioritaria: boolean;
  permiteHorarioRepartido: boolean;
  permiteHorasExtras: boolean;
  limiteHorasExtrasSemanais: number;
  movimentos: MovimentoOperacionalPayload[];
  necessidades: NecessidadeEquipePayload[];
}

export interface PerfilOperacionalFormState {
  erro?: string;
  sucesso?: boolean;
}

export interface LinhaNecessidadeOperacional {
  diaSemana: number;
  periodo: PeriodoOperacional;
  zonaId: string;
  funcao: string;
  minimo: number;
  ideal: number;
  maximo: number;
}

export type ResultadoPerfilOperacional =
  | { dados: PerfilOperacionalPayload; erro?: never }
  | { dados?: never; erro: string };

const FORMATO_HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function lerJson(campo: FormDataEntryValue | null, nome: string): unknown[] {
  if (!campo) return [];

  try {
    const dados: unknown = JSON.parse(String(campo));
    return Array.isArray(dados) ? dados : [];
  } catch {
    throw new Error(`Dados inválidos em ${nome}.`);
  }
}

function comoRegistro(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === "object"
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizarMovimentos(valor: unknown[]): MovimentoOperacionalPayload[] {
  return valor.map((item) => {
    const movimento = comoRegistro(item);
    return {
      dia_semana: Number(movimento.dia_semana),
      periodo: String(movimento.periodo ?? "") as PeriodoOperacional,
      nivel: String(movimento.nivel ?? "") as NivelMovimento,
    };
  });
}

function normalizarNecessidades(valor: unknown[]): NecessidadeEquipePayload[] {
  return valor.map((item) => {
    const necessidade = comoRegistro(item);
    const zonaId =
      necessidade.zona_id === null || necessidade.zona_id === undefined
        ? null
        : String(necessidade.zona_id);
    const funcao = String(necessidade.funcao ?? "").trim();

    return {
      dia_semana: Number(necessidade.dia_semana),
      periodo: String(necessidade.periodo ?? "") as PeriodoOperacional,
      zona_id: zonaId,
      funcao: funcao || null,
      minimo: Number(necessidade.minimo),
      ideal: Number(necessidade.ideal),
      maximo: Number(necessidade.maximo),
    };
  });
}

export function validarHorarios(horarios: HorarioOperacionalPayload[]): string | null {
  for (const horario of horarios) {
    if (horario.fechado) continue;

    if (
      (horario.hora_abertura !== null && !FORMATO_HORA.test(horario.hora_abertura)) ||
      (horario.hora_fechamento !== null && !FORMATO_HORA.test(horario.hora_fechamento))
    ) {
      return "Horário de funcionamento inválido. Use o formato HH:mm.";
    }
  }

  return null;
}

export function validarMovimentos(movimentos: MovimentoOperacionalPayload[]): string | null {
  for (const movimento of movimentos) {
    if (!Number.isInteger(movimento.dia_semana) || movimento.dia_semana < 0 || movimento.dia_semana > 6) {
      return "Dia da semana inválido na configuração de movimento.";
    }
    if (!(PERIODOS_OPERACIONAIS as string[]).includes(movimento.periodo)) {
      return "Período inválido na configuração de movimento.";
    }
    if (!(NIVEIS_MOVIMENTO as string[]).includes(movimento.nivel)) {
      return "Nível de movimento inválido.";
    }
  }
  return null;
}

export function validarNecessidades(necessidades: NecessidadeEquipePayload[]): string | null {
  for (const necessidade of necessidades) {
    if (!Number.isInteger(necessidade.dia_semana) || necessidade.dia_semana < 0 || necessidade.dia_semana > 6) {
      return "Dia da semana inválido na necessidade de equipa.";
    }
    if (!(PERIODOS_OPERACIONAIS as string[]).includes(necessidade.periodo)) {
      return "Período inválido na necessidade de equipa.";
    }
    if (
      !Number.isInteger(necessidade.minimo) ||
      !Number.isInteger(necessidade.ideal) ||
      !Number.isInteger(necessidade.maximo) ||
      necessidade.minimo < 0 ||
      necessidade.ideal < necessidade.minimo ||
      necessidade.maximo < necessidade.ideal
    ) {
      return "Os valores mínimo, ideal e máximo da equipa são inválidos.";
    }
    if (necessidade.zona_id !== null && !necessidade.zona_id.trim()) {
      return "Zona inválida na necessidade de equipa.";
    }
  }
  return null;
}

export function validarLinhasNecessidade(necessidades: LinhaNecessidadeOperacional[]): string | null {
  for (const necessidade of necessidades) {
    if (
      !Number.isFinite(necessidade.minimo) ||
      !Number.isFinite(necessidade.ideal) ||
      !Number.isFinite(necessidade.maximo) ||
      necessidade.minimo < 0 ||
      necessidade.ideal < necessidade.minimo ||
      necessidade.maximo < necessidade.ideal
    ) {
      return "Em Necessidade de equipa, confira se mínimo ≤ ideal ≤ máximo em todas as linhas.";
    }
  }
  return null;
}

export function paraNecessidadesPayload(necessidades: LinhaNecessidadeOperacional[]): NecessidadeEquipePayload[] {
  return necessidades.map((linha) => ({
    dia_semana: linha.diaSemana,
    periodo: linha.periodo,
    zona_id: linha.zonaId || null,
    funcao: linha.funcao.trim() || null,
    minimo: Number(linha.minimo),
    ideal: Number(linha.ideal),
    maximo: Number(linha.maximo),
  }));
}

export function paraMovimentosPayload(
  movimentos: MovimentoOperacional[]
): MovimentoOperacionalPayload[] {
  return movimentos.map((movimento) => ({
    dia_semana: movimento.diaSemana,
    periodo: movimento.periodo,
    nivel: movimento.nivel,
  }));
}

export function lerPerfilOperacionalFormData(formData: FormData): ResultadoPerfilOperacional {
  const diasFuncionamento: number[] = [];
  const horarios: HorarioOperacionalPayload[] = [];

  for (let dia = 0; dia < 7; dia++) {
    const aberto = formData.get(`aberto-${dia}`) === "on";
    if (aberto) diasFuncionamento.push(dia);
    horarios.push({
      dia_semana: dia,
      fechado: !aberto,
      hora_abertura: aberto ? String(formData.get(`abertura-${dia}`) ?? "") || null : null,
      hora_fechamento: aberto ? String(formData.get(`fechamento-${dia}`) ?? "") || null : null,
    });
  }

  if (diasFuncionamento.length === 0) return { erro: "Selecione pelo menos um dia de funcionamento." };

  let movimentos: MovimentoOperacionalPayload[];
  let necessidades: NecessidadeEquipePayload[];
  try {
    movimentos = normalizarMovimentos(lerJson(formData.get("movimentosOperacionais"), "movimentosOperacionais"));
    necessidades = normalizarNecessidades(lerJson(formData.get("necessidadesEquipe"), "necessidadesEquipe"));
  } catch (error) {
    return { erro: error instanceof Error ? error.message : "Os dados operacionais enviados são inválidos." };
  }

  const erro = validarHorarios(horarios) ?? validarMovimentos(movimentos) ?? validarNecessidades(necessidades);
  if (erro) return { erro };

  const permiteHorasExtras = formData.get("permiteHorasExtras") === "true";
  const limiteHorasExtrasInformado = Number(formData.get("limiteHorasExtrasSemanais") ?? 0);
  if (
    permiteHorasExtras &&
    (limiteHorasExtrasInformado < 0 ||
      limiteHorasExtrasInformado > 2 ||
      (limiteHorasExtrasInformado !== 1 && limiteHorasExtrasInformado !== 2))
  ) {
    return { erro: "O limite semanal de horas extras deve ser 1 ou 2 horas." };
  }

  return {
    dados: {
      diasFuncionamento,
      horarios,
      coberturaFdsPrioritaria: formData.get("coberturaFdsPrioritaria") === "on",
      permiteHorarioRepartido: formData.get("permiteHorarioRepartido") === "true",
      permiteHorasExtras,
      limiteHorasExtrasSemanais: permiteHorasExtras ? limiteHorasExtrasInformado : 0,
      movimentos,
      necessidades,
    },
  };
}
