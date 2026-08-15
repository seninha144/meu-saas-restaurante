/** Calcula as horas efetivamente trabalhadas num turno, descontando a pausa. */
export function horasEfetivasDoTurno(
  horaInicio: string | null,
  horaFim: string | null,
  pausaAlmocoMinutos = 0
): number {
  if (!horaInicio || !horaFim) return 0;

  const [horaInicioNumero, minutoInicio] = horaInicio.slice(0, 5).split(":").map(Number);
  const [horaFimNumero, minutoFim] = horaFim.slice(0, 5).split(":").map(Number);
  const minutosBrutos = horaFimNumero * 60 + minutoFim - (horaInicioNumero * 60 + minutoInicio);

  return Math.max(0, minutosBrutos - pausaAlmocoMinutos) / 60;
}

export function formatarHoras(horas: number): string {
  return `${Math.round(horas * 100) / 100}h`;
}
