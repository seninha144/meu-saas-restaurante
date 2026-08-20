import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptarSnapshotParaGeradorAtual,
  normalizarSnapshotSemanal,
  type EntradaSnapshotSemanal,
} from "../src/lib/escalas/snapshot-semanal.ts";

function entradaBase(): EntradaSnapshotSemanal {
  const escalasHistoricas = [
    { id: "s-1", semana_inicio: "2026-08-10" },
    { id: "s-2", semana_inicio: "2026-08-03" },
    { id: "s-3", semana_inicio: "2026-07-27" },
    { id: "s-4", semana_inicio: "2026-07-20" },
  ];

  return {
    agoraReferencia: "2026-08-13T14:30:00.000Z",
    restaurante: {
      id: "restaurante-1",
      usa_zonas: true,
      permite_ia: true,
      dias_funcionamento: [0, 1, 2, 3, 4, 5],
      cobertura_fds_prioritaria: true,
      permite_horario_repartido: true,
      permite_horas_extras: true,
      limite_horas_extras_semanais: 2,
    },
    escala: { id: "atual", semana_inicio: "2026-08-17", semana_fim: "2026-08-23" },
    horarios: [
      { dia_semana: 0, fechado: false, hora_abertura: "09:00:00", hora_fechamento: "23:00:00" },
      { dia_semana: 5, fechado: false, hora_abertura: "18:00:00", hora_fechamento: "01:00:00" },
      { dia_semana: 6, fechado: true, hora_abertura: null, hora_fechamento: null },
    ],
    zonas: [{ id: "sala", capacidade_minima: 2 }],
    funcionarios: [{
      id: "maria",
      cargo: "Bartender",
      zona_id: "sala",
      carga_horaria_semanal_max: 40,
      folgas_obrigatorias_semana: 2,
      pausa_almoco_minutos: 30,
      pode_abertura: true,
      pode_fechamento: true,
      aceita_horario_repartido: true,
      aceita_horas_extras: true,
    }],
    disponibilidades: [{
      funcionario_id: "maria",
      dia_semana: 2,
      disponivel: false,
      periodo: null,
    }],
    movimentos: [{ dia_semana: 5, periodo: "Fechamento", nivel: "muito_alto" }],
    necessidades: [{
      dia_semana: 5,
      periodo: "Fechamento",
      zona_id: "sala",
      funcao: "Bartender",
      minimo: 1,
      ideal: 2,
      maximo: 3,
    }],
    turnosExistentes: [],
    escalasHistoricas,
    turnosHistoricos: escalasHistoricas.map((escala, indice) => ({
      escala_id: escala.id,
      funcionario_id: "maria",
      dia_semana: 5,
      periodo: "Fechamento",
      hora_inicio: "18:00",
      hora_fim: indice === 0 ? "01:00" : "23:00",
    })),
  };
}

test("normaliza horário comum e preserva fechamento após meia-noite", () => {
  const snapshot = normalizarSnapshotSemanal(entradaBase());
  assert.deepEqual(snapshot.horarios.slice(0, 2), [
    { diaSemana: 0, fechado: false, abertura: "09:00", fechamento: "23:00" },
    { diaSemana: 5, fechado: false, abertura: "18:00", fechamento: "01:00" },
  ]);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.deepEqual(snapshot.diasAbertos, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(snapshot.diasFechados, [6]);
});

test("representa indisponibilidade e aptidão para abertura e fechamento", () => {
  const snapshot = normalizarSnapshotSemanal(entradaBase());
  assert.deepEqual(snapshot.disponibilidades[0], {
    funcionarioId: "maria",
    diaSemana: 2,
    disponivel: false,
    periodo: null,
  });
  assert.equal(snapshot.funcionarios[0].podeAbertura, true);
  assert.equal(snapshot.funcionarios[0].podeFechamento, true);
  assert.equal(snapshot.restaurante.permiteHorarioRepartido, true);
  assert.equal(snapshot.funcionarios[0].aceitaHorarioRepartido, true);
  assert.equal(snapshot.restaurante.permiteHorasExtras, true);
  assert.equal(snapshot.restaurante.limiteHorasExtrasSemanais, 2);
  assert.equal(snapshot.funcionarios[0].aceitaHorasExtras, true);
});

test("preserva necessidades por função e zona", () => {
  const snapshot = normalizarSnapshotSemanal(entradaBase());
  assert.deepEqual(snapshot.necessidades[0], {
    diaSemana: 5,
    periodo: "Fechamento",
    zonaId: "sala",
    funcao: "Bartender",
    minimo: 1,
    ideal: 2,
    maximo: 3,
  });
  assert.deepEqual(snapshot.cargos, ["Bartender"]);
});

test("inclui quatro semanas de histórico e identifica a fronteira anterior", () => {
  const snapshot = normalizarSnapshotSemanal(entradaBase());
  assert.equal(snapshot.historicoQuatroSemanas.length, 4);
  assert.equal(snapshot.turnosSemanaAnterior.length, 1);
  assert.equal(snapshot.turnosSemanaAnterior[0].semanaInicio, "2026-08-10");
  assert.equal(snapshot.turnosSemanaAnterior[0].horaFim, "01:00");
});

test("adaptador entrega ao gerador atual os mesmos formatos anteriores", () => {
  const snapshot = normalizarSnapshotSemanal(entradaBase());
  const legado = adaptarSnapshotParaGeradorAtual(snapshot);

  assert.deepEqual(legado.restaurante.dias_funcionamento, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(legado.horariosPorDia.get(5), {
    fechado: false,
    abertura: "18:00",
    fechamento: "01:00",
  });
  assert.equal(legado.funcionarios[0].diasTrabalhoAlvo, 5);
  assert.equal(legado.disponibilidades[0].disponivel, false);
  assert.equal(legado.movimentos[0].nivel, "muito_alto");
  assert.equal(legado.necessidades[0].funcao, "Bartender");
  assert.equal(legado.restaurante.permite_horas_extras, true);
  assert.equal(legado.restaurante.limite_horas_extras_semanais, 2);
});

test("snapshot temporal usa o fuso do restaurante e permanece serializável", () => {
  const entrada = entradaBase();
  entrada.agoraReferencia = "2026-08-20T14:30:00.000Z";
  entrada.restaurante!.fuso_horario = "Europe/Lisbon";
  const snapshot = normalizarSnapshotSemanal(entrada);
  assert.equal(snapshot.temporal?.dataAtualLocal, "2026-08-20");
  assert.equal(snapshot.temporal?.agoraLocal.startsWith("2026-08-20T15:30"), true);
  assert.equal(snapshot.temporal?.diaAtual, 3);
  assert.deepEqual(snapshot.temporal?.diasPassados, [0, 1, 2]);
  assert.equal(snapshot.temporal?.inicioMinimoDiaAtual, 16 * 60);
  assert.doesNotThrow(() => JSON.stringify(snapshot.temporal));
});
