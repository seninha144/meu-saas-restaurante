import { horasEfetivasDoTurno, intervaloEmMinutos } from "../horas.ts";
import { MAX_HORAS_DIARIAS_AUTOMATICAS } from "./contexto-temporal.ts";
import type { FuncionarioSnapshot, SnapshotSemanal } from "./snapshot-semanal.ts";

export function cargaAlvoPlanejavel(
  snapshot: SnapshotSemanal,
  funcionario: FuncionarioSnapshot
): number {
  const contexto = snapshot.temporal;
  if (!contexto?.semanaEmAndamento) return funcionario.cargaHorariaSemanalMax;

  const turnosPreservados = snapshot.turnosExistentes.filter(
    (turno) =>
      turno.funcionarioId === funcionario.id &&
      (contexto.diasPassados.includes(turno.diaSemana) || turno.diaSemana === contexto.diaAtual) &&
      turno.horaInicio && turno.horaFim
  );
  const horasPreservadas = turnosPreservados.reduce(
    (total, turno) => total + horasEfetivasDoTurno(
      turno.horaInicio!, turno.horaFim!, funcionario.pausaAlmocoMinutos
    ),
    0
  );
  let capacidadeRestante = 0;
  for (const diaSemana of snapshot.diasAbertos) {
    if (contexto.diasPassados.includes(diaSemana)) continue;
    const indisponivel = snapshot.disponibilidades.some(
      (item) => item.funcionarioId === funcionario.id && item.diaSemana === diaSemana &&
        !item.disponivel && (item.periodo === null || item.periodo === "Total")
    );
    if (indisponivel) continue;
    const horario = snapshot.horarios.find((item) => item.diaSemana === diaSemana && !item.fechado);
    if (!horario) continue;
    const operacao = intervaloEmMinutos(horario.abertura, horario.fechamento);
    const inicio = diaSemana === contexto.diaAtual
      ? Math.max(operacao.inicio, contexto.inicioMinimoDiaAtual ?? operacao.inicio)
      : operacao.inicio;
    const capacidade = Math.max(
      0,
      (operacao.fim - inicio - funcionario.pausaAlmocoMinutos) / 60
    );
    const jaPlanejado = turnosPreservados
      .filter((turno) => turno.diaSemana === diaSemana)
      .reduce((total, turno) => total + horasEfetivasDoTurno(
        turno.horaInicio!, turno.horaFim!, funcionario.pausaAlmocoMinutos
      ), 0);
    capacidadeRestante += Math.max(0, Math.min(MAX_HORAS_DIARIAS_AUTOMATICAS, capacidade) - jaPlanejado);
  }
  return Math.min(
    funcionario.cargaHorariaSemanalMax,
    Math.round((horasPreservadas + capacidadeRestante) * 100) / 100
  );
}
