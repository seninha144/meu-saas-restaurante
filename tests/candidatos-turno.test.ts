import assert from "node:assert/strict";
import test from "node:test";
import { gerarCandidatosTurno, periodosAtravessados } from "../src/lib/escalas/candidatos-turno.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";
import { criarContextoTemporalSemanal } from "../src/lib/escalas/contexto-temporal.ts";

function snapshotBase(abertura = "09:00", fechamento = "23:00"): SnapshotSemanal {
  return {
    restaurante: {
      id: "r1",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: [0, 1],
      coberturaFdsPrioritaria: false,
      permiteHorarioRepartido: false,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "e1", inicio: "2026-08-17", fim: "2026-08-23" },
    horarios: [
      { diaSemana: 0, fechado: false, abertura, fechamento },
      { diaSemana: 1, fechado: true, abertura: "09:00", fechamento: "23:00" },
    ],
    diasAbertos: [0],
    diasFechados: [1, 2, 3, 4, 5, 6],
    zonas: [{ id: "sala", capacidadeMinima: 1 }],
    funcionarios: [{
      id: "maria",
      cargo: "Sala",
      zonaId: "sala",
      cargaHorariaSemanalMax: 40,
      pausaAlmocoMinutos: 30,
      diasTrabalhoAlvo: 5,
      podeAbertura: true,
      podeFechamento: true,
      aceitaHorarioRepartido: false,
      aceitaHorasExtras: false,
    }],
    cargos: ["Sala"],
    disponibilidades: [],
    movimentos: [],
    necessidades: [],
    turnosExistentes: [],
    historicoQuatroSemanas: [],
    turnosSemanaAnterior: [],
  };
}

test("dia fechado gera zero candidatos", () => {
  const snapshot = snapshotBase();
  snapshot.diasAbertos = [];
  assert.equal(gerarCandidatosTurno(snapshot).length, 0);
});

test("indisponibilidade integral gera zero candidatos", () => {
  const snapshot = snapshotBase();
  snapshot.disponibilidades.push({
    funcionarioId: "maria",
    diaSemana: 0,
    disponivel: false,
    periodo: null,
  });
  assert.equal(gerarCandidatosTurno(snapshot).length, 0);
});

test("gera candidatos dentro de 09:00 → 23:00", () => {
  const candidatos = gerarCandidatosTurno(snapshotBase());
  assert.ok(candidatos.length > 0);
  assert.ok(candidatos.every((item) => item.horaInicio >= "09:00" && item.horaFim <= "23:00"));
});

test("preserva minutos absolutos em 18:00 → 01:00", () => {
  const candidatos = gerarCandidatosTurno(snapshotBase("18:00", "01:00"));
  const fechamento = candidatos.find((item) => item.cobreFechamento);
  assert.ok(fechamento);
  assert.equal(fechamento.horaFim, "01:00");
  assert.ok(fechamento.fimMinutosAbsolutos > 24 * 60);
});

test("aceita 00:00 como fechamento", () => {
  const candidatos = gerarCandidatosTurno(snapshotBase("18:00", "00:00"));
  const fechamento = candidatos.find((item) => item.cobreFechamento);
  assert.ok(fechamento);
  assert.equal(fechamento.horaFim, "00:00");
  assert.equal(fechamento.fimMinutosAbsolutos, 24 * 60);
});

test("identifica candidatos de abertura e fechamento", () => {
  const candidatos = gerarCandidatosTurno(snapshotBase());
  assert.ok(candidatos.some((item) => item.cobreAbertura));
  assert.ok(candidatos.some((item) => item.cobreFechamento));
});

test("identifica todos os períodos atravessados", () => {
  const horario = { diaSemana: 0, fechado: false, abertura: "09:00", fechamento: "23:00" };
  assert.deepEqual(periodosAtravessados(horario, 11 * 60, 20 * 60), [
    "Abertura",
    "Almoço",
    "Tarde",
    "Fechamento",
  ]);
});

test("estrutura permite múltiplos candidatos do mesmo funcionário e dia", () => {
  const candidatos = gerarCandidatosTurno(snapshotBase());
  const mesmoDia = candidatos.filter((item) => item.funcionarioId === "maria" && item.diaSemana === 0);
  assert.ok(mesmoDia.length > 1);
  assert.equal(new Set(mesmoDia.map((item) => item.id)).size, mesmoDia.length);
});

test("geração é pura e não altera o snapshot consumido pelo gerador atual", () => {
  const snapshot = snapshotBase("18:00", "01:00");
  const antes = JSON.stringify(snapshot);
  gerarCandidatosTurno(snapshot);
  assert.equal(JSON.stringify(snapshot), antes);
});

test("semana atual não cria candidato passado nem iniciado antes da margem", () => {
  const snapshot = snapshotBase();
  snapshot.temporal = criarContextoTemporalSemanal(
    "2026-08-17", new Date("2026-08-17T14:30:00Z"), "Europe/Lisbon"
  );
  const candidatos = gerarCandidatosTurno(snapshot);
  assert.ok(candidatos.length > 0);
  assert.ok(candidatos.every((item) => item.inicioMinutosAbsolutos >= 16 * 60));
});

test("candidatos nunca excedem nove horas líquidas por dia", () => {
  const snapshot = snapshotBase("09:00", "23:00");
  const candidatos = gerarCandidatosTurno(snapshot);
  assert.ok(candidatos.every((item) => item.duracaoMinutos - 30 <= 9 * 60));
});
