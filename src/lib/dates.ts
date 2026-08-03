/* =====================================================================
 * Toda a aritmética aqui usa Date.UTC / getUTC* / setUTC*, nunca as
 * variantes locais (getDay, setDate, toISOString sozinho). Motivo: em
 * fuso horário positivo (ex: Portugal no horário de verão, UTC+1),
 * `new Date(anoLocal, mes, dia).toISOString()` pode devolver o dia
 * ANTERIOR, porque a meia-noite local vira 23h do dia anterior em UTC.
 * Isso corrompe silenciosamente qual "segunda-feira" está sendo
 * calculada, dependendo de onde o código roda. Trabalhando só em UTC,
 * o resultado é o mesmo não importa o fuso da máquina que executa.
 * ===================================================================== */

/** Meia-noite UTC do dia de hoje (ou de `referencia`, se passada). */
function hojeUTC(referencia: Date = new Date()): Date {
  return new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate()));
}

/** Segunda-feira (00:00 UTC) da semana que contém `data`. */
export function getInicioSemana(data: Date): Date {
  const d = hojeUTC(data);
  const diaSemanaISO = (d.getUTCDay() + 6) % 7; // 0 = Segunda ... 6 = Domingo
  d.setUTCDate(d.getUTCDate() - diaSemanaISO);
  return d;
}

export interface SemanaCalculada {
  inicio: Date;
  fim: Date;
  dias: Date[]; // os 7 dias, Segunda a Domingo, em UTC
}

export function getSemana(offset: number, referencia: Date = new Date()): SemanaCalculada {
  const inicioAtual = getInicioSemana(referencia);
  const inicio = new Date(inicioAtual);
  inicio.setUTCDate(inicio.getUTCDate() + offset * 7);

  const dias = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(inicio);
    dia.setUTCDate(dia.getUTCDate() + i);
    return dia;
  });

  return { inicio, fim: dias[6], dias };
}

/** "YYYY-MM-DD" a partir de uma data já em UTC (não usa toISOString solto). */
export function toISODate(d: Date): string {
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function formatarIntervalo(inicio: Date, fim: Date, locale: "pt-BR" | "pt-PT" = "pt-PT"): string {
  const mesmoMes = inicio.getUTCMonth() === fim.getUTCMonth();
  const opcoes: Intl.DateTimeFormatOptions = { day: "numeric", timeZone: "UTC" };
  const fmtDia = new Intl.DateTimeFormat(locale, opcoes);

  if (mesmoMes) {
    const fmtDiaMes = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
    return `${fmtDia.format(inicio)} – ${fmtDiaMes.format(fim)}`;
  }

  const fmtCurto = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmtCurto.format(inicio)} – ${fmtCurto.format(fim)}`;
}

export function formatarDiaHeader(data: Date, locale: "pt-BR" | "pt-PT" = "pt-PT") {
  const abrev = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
    .format(data)
    .replace(".", "");
  return { abrev: abrev.charAt(0).toUpperCase() + abrev.slice(1), numero: data.getUTCDate() };
}

export function ehMesmoDia(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}