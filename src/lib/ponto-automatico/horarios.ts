export const FUSO_HORARIO_PADRAO = "Europe/Lisbon";

export interface DataLocal { ano: number; mes: number; dia: number }
interface DataHoraLocal extends DataLocal { hora: number; minuto: number; segundo: number }

function partesNoFuso(data: Date, fusoHorario: string): DataHoraLocal {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoHorario, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  return { ano: valor("year"), mes: valor("month"), dia: valor("day"), hora: valor("hour"), minuto: valor("minute"), segundo: valor("second") };
}

export function fusoHorarioValido(fusoHorario: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: fusoHorario }).format(); return true; } catch { return false; }
}

export function dataLocal(data: Date, fusoHorario: string): DataLocal {
  const { ano, mes, dia } = partesNoFuso(data, fusoHorario);
  return { ano, mes, dia };
}

export function adicionarDias(data: DataLocal, quantidade: number): DataLocal {
  const resultado = new Date(Date.UTC(data.ano, data.mes - 1, data.dia + quantidade));
  return { ano: resultado.getUTCFullYear(), mes: resultado.getUTCMonth() + 1, dia: resultado.getUTCDate() };
}

export function diaSemana(data: DataLocal): number {
  return (new Date(Date.UTC(data.ano, data.mes - 1, data.dia)).getUTCDay() + 6) % 7;
}

export function dataISO(data: DataLocal): string {
  return `${data.ano}-${String(data.mes).padStart(2, "0")}-${String(data.dia).padStart(2, "0")}`;
}

/** Converte um horário civil do restaurante no instante UTC correspondente. */
export function horarioLocalParaUTC(data: DataLocal, horario: string, fusoHorario: string): Date {
  const [hora, minuto, segundo = 0] = horario.split(":").map(Number);
  const desejado = Date.UTC(data.ano, data.mes - 1, data.dia, hora, minuto, segundo);
  let instante = desejado;
  // Ajusta pelo offset real da zona naquela data (incluindo horário de verão).
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const local = partesNoFuso(new Date(instante), fusoHorario);
    const representado = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto, local.segundo);
    const diferenca = desejado - representado;
    instante += diferenca;
    if (diferenca === 0) break;
  }
  return new Date(instante);
}

export function intervaloDoTurno(data: DataLocal, horaInicio: string, horaFim: string, fusoHorario: string) {
  const inicio = horarioLocalParaUTC(data, horaInicio, fusoHorario);
  const dataFim = horaFim <= horaInicio ? adicionarDias(data, 1) : data;
  return { inicio, fim: horarioLocalParaUTC(dataFim, horaFim, fusoHorario) };
}
