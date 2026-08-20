import assert from "node:assert/strict";
import test from "node:test";
import { gerarCandidatosTurno } from "../src/lib/escalas/candidatos-turno.ts";
import { CpSatSolverAdapter, criarPayloadCpSat } from "../src/lib/escalas/solver/cp-sat-solver-adapter.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";

const PERIODOS = ["Abertura", "Almoço", "Tarde", "Fechamento"];

function snapshotBase(): SnapshotSemanal {
  return {
    restaurante: {
      id: "r1",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: [0],
      coberturaFdsPrioritaria: false,
      permiteHorarioRepartido: true,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "e1", inicio: "2026-08-24", fim: "2026-08-30" },
    horarios: [{ diaSemana: 0, fechado: false, abertura: "09:00", fechamento: "17:00" }],
    diasAbertos: [0],
    diasFechados: [1, 2, 3, 4, 5, 6],
    zonas: [{ id: "cozinha", capacidadeMinima: 1 }],
    funcionarios: [{
      id: "maria",
      cargo: "Cozinha",
      zonaId: "cozinha",
      cargaHorariaSemanalMax: 8,
      pausaAlmocoMinutos: 0,
      diasTrabalhoAlvo: 1,
      podeAbertura: true,
      podeFechamento: true,
      aceitaHorarioRepartido: true,
      aceitaHorasExtras: false,
    }],
    cargos: ["Cozinha"],
    disponibilidades: [],
    movimentos: [],
    necessidades: PERIODOS.map((periodo) => ({
      diaSemana: 0,
      periodo,
      zonaId: "cozinha",
      funcao: "Cozinha",
      minimo: 1,
      ideal: 1,
      maximo: 1,
    })),
    turnosExistentes: [],
    historicoQuatroSemanas: [],
    turnosSemanaAnterior: [],
  };
}

function resposta(candidateIds: string[]) {
  return new Response(JSON.stringify({
    status: "optimal",
    candidateIds,
    solveTimeMs: 12.5,
    variables: 10,
    constraints: 20,
    seed: 123,
    completedStages: ["coberturaIdeal", "excessoMaximo", "carga", "justica", "preferencias"],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("aceita solução CP-SAT que passa pelo validador TypeScript", async () => {
  const snapshot = snapshotBase();
  const candidatos = gerarCandidatosTurno(snapshot);
  const completo = candidatos.find((item) => item.cobreAbertura && item.cobreFechamento);
  assert.ok(completo);
  const adapter = new CpSatSolverAdapter({
    url: "http://cp-sat.test",
    fetchImpl: async () => resposta([completo.id]),
  });
  const resultado = await adapter.resolver(snapshot, candidatos);
  assert.equal(resultado.status, "solucao_valida");
  assert.equal(resultado.validacao?.valida, true);
  assert.equal(resultado.avaliacao?.valida, true);
  assert.equal(resultado.metadados.quantidadeConstraints, 20);
});

test("rejeita IDs desconhecidos e respostas inválidas", async () => {
  const snapshot = snapshotBase();
  const candidatos = gerarCandidatosTurno(snapshot);
  const desconhecido = new CpSatSolverAdapter({
    url: "http://cp-sat.test",
    fetchImpl: async () => resposta(["candidato-inexistente"]),
  });
  assert.equal((await desconhecido.resolver(snapshot, candidatos)).status, "erro");

  const respostaInvalida = new CpSatSolverAdapter({
    url: "http://cp-sat.test",
    fetchImpl: async () => new Response(JSON.stringify({ status: "optimal" }), { status: 200 }),
  });
  assert.equal((await respostaInvalida.resolver(snapshot, candidatos)).status, "erro");
});

test("serviço indisponível não quebra a aplicação", async () => {
  const adapter = new CpSatSolverAdapter({
    url: "http://cp-sat.test",
    fetchImpl: async () => { throw new Error("connection refused"); },
  });
  const snapshot = snapshotBase();
  const resultado = await adapter.resolver(snapshot, gerarCandidatosTurno(snapshot));
  assert.equal(resultado.status, "indisponivel");
  assert.equal(resultado.metadados.fallbackRecomendado, true);
});

test("timeout HTTP é devolvido sem lançar erro", async () => {
  const adapter = new CpSatSolverAdapter({
    url: "http://cp-sat.test",
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });
  const snapshot = snapshotBase();
  const resultado = await adapter.resolver(snapshot, gerarCandidatosTurno(snapshot), { limiteTempoMs: 1 });
  assert.equal(resultado.status, "tempo_esgotado");
});

test("resposta formalmente válida mas operacionalmente inválida é rejeitada", async () => {
  const snapshot = snapshotBase();
  const candidatos = gerarCandidatosTurno(snapshot);
  const adapter = new CpSatSolverAdapter({
    url: "http://cp-sat.test",
    fetchImpl: async () => resposta([]),
  });
  const resultado = await adapter.resolver(snapshot, candidatos);
  assert.equal(resultado.status, "solucao_invalida");
  assert.equal(resultado.validacao?.valida, false);
});

test("payload CP-SAT recebe carga alvo e limite automático em minutos", () => {
  const snapshot = snapshotBase();
  snapshot.restaurante.permiteHorasExtras = true;
  snapshot.restaurante.limiteHorasExtrasSemanais = 2;
  snapshot.funcionarios[0].aceitaHorasExtras = true;
  snapshot.funcionarios[0].pausaAlmocoMinutos = 30;
  const candidatos = gerarCandidatosTurno(snapshot);
  const payload = criarPayloadCpSat(snapshot, candidatos, 2_000);
  assert.equal(payload.limiteDiarioAutomaticoMinutos, 540);
  assert.equal(payload.funcionarios[0].cargaAlvoMinutos, 480);
  assert.equal(payload.funcionarios[0].limiteAutomaticoMinutos, 600);
  assert.equal(payload.funcionarios[0].horasExtrasPermitidasMinutos, 120);
  assert.equal(payload.candidatos[0].duracaoEfetiva, payload.candidatos[0].duracao - 30);
});
