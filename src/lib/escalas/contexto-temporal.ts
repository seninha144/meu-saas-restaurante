const MILISSEGUNDOS_DIA = 86_400_000;

export const MINUTOS_ANTECEDENCIA_TURNO_ATUAL = 30;
export const MAX_MINUTOS_DIARIOS_AUTOMATICOS = 9 * 60;
export const MAX_HORAS_DIARIAS_AUTOMATICAS = 9;

export type ClassificacaoSemana = "passada" | "atual" | "futura";

export interface ContextoTemporalSemanal {
  fusoHorario: string;
  agoraLocal: string;
  dataAtualLocal: string;
  minutosAtuais: number;
  classificacao: ClassificacaoSemana;
  semanaEmAndamento: boolean;
  diasPassados: number[];
  diaAtual: number | null;
  inicioMinimoDiaAtual: number | null;
}

function partesLocais(agora: Date, fusoHorario: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoHorario,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "00";
  return {
    data: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}:${valor("second")}`,
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

function adicionarDias(dataISO: string, dias: number) {
  const data = new Date(`${dataISO}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function criarContextoTemporalSemanal(
  semanaInicio: string,
  agoraReferencia: Date,
  fusoHorario: string
): ContextoTemporalSemanal {
  const local = partesLocais(agoraReferencia, fusoHorario);
  const semanaFim = adicionarDias(semanaInicio, 6);
  const classificacao: ClassificacaoSemana = local.data < semanaInicio
    ? "futura"
    : local.data > semanaFim ? "passada" : "atual";
  const diaAtual = classificacao === "atual"
    ? Math.round(
        (Date.parse(`${local.data}T00:00:00Z`) - Date.parse(`${semanaInicio}T00:00:00Z`)) /
          MILISSEGUNDOS_DIA
      )
    : null;
  const diasPassados = diaAtual === null
    ? classificacao === "passada" ? [0, 1, 2, 3, 4, 5, 6] : []
    : Array.from({ length: diaAtual }, (_, indice) => indice);
  return {
    fusoHorario,
    agoraLocal: `${local.data}T${local.hora}`,
    dataAtualLocal: local.data,
    minutosAtuais: local.minutos,
    classificacao,
    semanaEmAndamento: classificacao === "atual" && ((diaAtual ?? 0) > 0 || local.minutos > 0),
    diasPassados,
    diaAtual,
    inicioMinimoDiaAtual: diaAtual === null ? null : Math.min(1440, local.minutos + MINUTOS_ANTECEDENCIA_TURNO_ATUAL),
  };
}

export function inicioAutomaticoPermitido(
  contexto: ContextoTemporalSemanal,
  diaSemana: number,
  inicioMinutos: number
) {
  if (contexto.classificacao === "passada" || contexto.diasPassados.includes(diaSemana)) return false;
  if (contexto.classificacao !== "atual" || contexto.diaAtual !== diaSemana) return true;
  return inicioMinutos >= (contexto.inicioMinimoDiaAtual ?? 0);
}

export function cabeNoLimiteDiarioAutomatico(
  horasJaPlanejadas: number,
  horasNovoTurno: number
) {
  return Math.round((horasJaPlanejadas + horasNovoTurno) * 60) <=
    MAX_MINUTOS_DIARIOS_AUTOMATICOS;
}
