/* =====================================================================
 * Nenhum dia é fixo/estático — tudo deriva de `new Date()` (ou de uma
 * data de referência) + um offset de navegação (-1 anterior, 0 atual,
 * +1 próxima...).
 * ===================================================================== */

export function getInicioSemana(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  const diaSemanaISO = (d.getDay() + 6) % 7; // 0 = Segunda ... 6 = Domingo
  d.setDate(d.getDate() - diaSemanaISO);
  return d;
}

export interface SemanaCalculada {
  inicio: Date;
  fim: Date;
  dias: Date[]; // os 7 dias, Segunda a Domingo
}

export function getSemana(offset: number, referencia: Date = new Date()): SemanaCalculada {
  const inicioAtual = getInicioSemana(referencia);
  const inicio = new Date(inicioAtual);
  inicio.setDate(inicio.getDate() + offset * 7);

  const dias = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(inicio);
    dia.setDate(dia.getDate() + i);
    return dia;
  });

  return { inicio, fim: dias[6], dias };
}

export function formatarIntervalo(inicio: Date, fim: Date, locale: "pt-BR" | "pt-PT" = "pt-PT"): string {
  const mesmoMes = inicio.getMonth() === fim.getMonth();
  const fmtDia = new Intl.DateTimeFormat(locale, { day: "numeric" });

  if (mesmoMes) {
    const fmtDiaMes = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
    return `${fmtDia.format(inicio)} – ${fmtDiaMes.format(fim)}`;
  }

  const fmtCurto = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return `${fmtCurto.format(inicio)} – ${fmtCurto.format(fim)}`;
}

export function formatarDiaHeader(data: Date, locale: "pt-BR" | "pt-PT" = "pt-PT") {
  const abrev = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(data).replace(".", "");
  return { abrev: abrev.charAt(0).toUpperCase() + abrev.slice(1), numero: data.getDate() };
}

export function ehMesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}