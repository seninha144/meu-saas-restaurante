export function paraMinutos(hora: string): number {
  const [horas, minutos] = hora.slice(0, 5).split(":").map(Number);
  return horas * 60 + minutos;
}

export function intervaloEmMinutos(
  horaInicio: string,
  horaFim: string
): { inicio: number; fim: number } {
  const inicio = paraMinutos(horaInicio);
  let fim = paraMinutos(horaFim);

  if (fim <= inicio) fim += 24 * 60;

  return { inicio, fim };
}

export function formatarHoraDoDia(minutos: number): string {
  const normalizado = ((Math.round(minutos) % (24 * 60)) + 24 * 60) % (24 * 60);

  return `${String(Math.floor(normalizado / 60)).padStart(2, "0")}:${String(
    normalizado % 60
  ).padStart(2, "0")}`;
}

export function dividirIntervalo(
  horaInicio: string,
  horaFim: string,
  quantidade: number
): number[] {
  const { inicio, fim } = intervaloEmMinutos(horaInicio, horaFim);
  const tamanho = Math.max(fim - inicio, quantidade * 30) / quantidade;

  return Array.from({ length: quantidade }, (_, indice) => inicio + tamanho * indice);
}

/** Calcula as horas efetivamente trabalhadas num turno, descontando a pausa. */
export function horasEfetivasDoTurno(
  horaInicio: string | null,
  horaFim: string | null,
  pausaAlmocoMinutos = 0
): number {
  if (!horaInicio || !horaFim) return 0;

  const { inicio, fim } = intervaloEmMinutos(horaInicio, horaFim);
  const minutosBrutos = fim - inicio;

  return Math.max(0, minutosBrutos - pausaAlmocoMinutos) / 60;
}

export function formatarHoras(horas: number): string {
  return `${Math.round(horas * 100) / 100}h`;
}
