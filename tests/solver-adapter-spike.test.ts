import assert from "node:assert/strict";
import test from "node:test";
import { gerarCandidatosTurno } from "../src/lib/escalas/candidatos-turno.ts";
import { resolverComFallback, type ResultadoSolver } from "../src/lib/escalas/solver/solver-adapter.ts";
import { SolverHeuristicoSpike } from "../src/lib/escalas/solver/solver-heuristico-spike.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";

const PERIODOS = ["Abertura", "AlmoÃ§o", "Tarde", "Fechamento"];

function criarSnapshot(quantidadeFuncionarios: number, dias = [0]): SnapshotSemanal {
  return {
    restaurante: {
      id: "r-spike",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: dias,
      coberturaFdsPrioritaria: false,
      permiteHorarioRepartido: false,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "e-spike", inicio: "2026-08-17", fim: "2026-08-23" },
    horarios: dias.map((diaSemana) => ({
      diaSemana,
      fechado: false,
      abertura: "09:00",
      fechamento: "23:00",
    })),
    diasAbertos: dias,
    diasFechados: [0, 1, 2, 3, 4, 5, 6].filter((dia) => !dias.includes(dia)),
    zonas: [{ id: "sala", capacidadeMinima: 1 }],
    funcionarios: Array.from({ length: quantidadeFuncionarios }, (_, indice) => ({
      id: `f-${String(indice).padStart(2, "0")}`,
      cargo: "Sala",
      zonaId: "sala",
      cargaHorariaSemanalMax: 40,
      pausaAlmocoMinutos: 30,
      diasTrabalhoAlvo: 5,
      podeAbertura: true,
      podeFechamento: true,
      aceitaHorarioRepartido: false,
      aceitaHorasExtras: false,
    })),
    cargos: ["Sala"],
    disponibilidades: [],
    movimentos: [],
    necessidades: dias.flatMap((diaSemana) =>
      PERIODOS.map((periodo) => ({
        diaSemana,
        periodo,
        zonaId: "sala",
        funcao: "Sala",
        minimo: 1,
        ideal: 1,
        maximo: 2,
      }))
    ),
    turnosExistentes: [],
    historicoQuatroSemanas: [],
    turnosSemanaAnterior: [],
  };
}

test("spike encontra solução validada e determinística", async () => {
  const snapshot = criarSnapshot(3);
  const candidatos = gerarCandidatosTurno(snapshot);
  const adapter = new SolverHeuristicoSpike();
  const primeira = await adapter.resolver(snapshot, candidatos);
  const segunda = await adapter.resolver(snapshot, candidatos);

  assert.equal(primeira.status, "solucao_valida");
  assert.equal(primeira.validacao?.valida, true);
  assert.equal(primeira.avaliacao?.valida, true);
  assert.deepEqual(primeira.solucao?.turnos, segunda.solucao?.turnos);
  assert.equal(primeira.metadados.deterministico, true);
});

test("spike devolve diagnóstico e permite fallback explícito", async () => {
  const snapshot = criarSnapshot(1);
  snapshot.disponibilidades.push({
    funcionarioId: "f-00",
    diaSemana: 0,
    disponivel: false,
    periodo: "Total",
  });
  const adapter = new SolverHeuristicoSpike();
  const resultado = await adapter.resolver(snapshot, gerarCandidatosTurno(snapshot));
  assert.equal(resultado.status, "nenhuma_solucao_encontrada");
  assert.equal(resultado.diagnostico.violacoes.length > 0, true);

  let chamouFallback = false;
  const fallback: ResultadoSolver = {
    ...resultado,
    status: "erro",
    diagnostico: { motivo: "fallback de teste", violacoes: [] },
  };
  const final = await resolverComFallback(adapter, snapshot, [], async () => {
    chamouFallback = true;
    return fallback;
  });
  assert.equal(chamouFallback, true);
  assert.equal(final.diagnostico.motivo, "fallback de teste");
});

for (const quantidade of [5, 15, 30]) {
  test(`spike de performance com ${quantidade} funcionários`, async (t) => {
    const snapshot = criarSnapshot(quantidade, [0, 1, 2, 3, 4, 5, 6]);
    const candidatos = gerarCandidatosTurno(snapshot);
    const resultado = await new SolverHeuristicoSpike().resolver(snapshot, candidatos, {
      limiteTempoMs: 30_000,
    });
    t.diagnostic(JSON.stringify({
      funcionarios: quantidade,
      candidatos: candidatos.length,
      tempoMs: resultado.tempoResolucaoMs,
      status: resultado.status,
      iteracoes: resultado.metadados.iteracoes,
    }));
    assert.equal(resultado.status, "solucao_valida");
    assert.equal(resultado.validacao?.valida, true);
  });
}
