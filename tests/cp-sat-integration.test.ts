import assert from "node:assert/strict";
import test from "node:test";
import { gerarCandidatosTurno, type TurnoCandidato } from "../src/lib/escalas/candidatos-turno.ts";
import { executarModoSombra, type TurnoLegadoSombra } from "../src/lib/escalas/modo-sombra.ts";
import { CpSatSolverAdapter } from "../src/lib/escalas/solver/cp-sat-solver-adapter.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";
import { PERIODOS_OPERACIONAIS } from "../src/types/dominio.ts";

const URL = process.env.CP_SAT_INTEGRATION_URL;

function snapshot(quantidade: number): SnapshotSemanal {
  const dias = [0, 1, 2, 3, 4, 5, 6];
  return {
    restaurante: {
      id: "r-cp-sat",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: dias,
      coberturaFdsPrioritaria: true,
      permiteHorarioRepartido: true,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "e-cp-sat", inicio: "2026-08-24", fim: "2026-08-30" },
    horarios: dias.map((diaSemana) => ({ diaSemana, fechado: false, abertura: "09:00", fechamento: "23:00" })),
    diasAbertos: dias,
    diasFechados: [],
    zonas: [{ id: "sala", capacidadeMinima: 1 }],
    funcionarios: Array.from({ length: quantidade }, (_, indice) => ({
      id: `f-${String(indice).padStart(2, "0")}`,
      cargo: "Sala",
      zonaId: "sala",
      cargaHorariaSemanalMax: 40,
      pausaAlmocoMinutos: 30,
      diasTrabalhoAlvo: 5,
      podeAbertura: true,
      podeFechamento: true,
      aceitaHorarioRepartido: indice % 2 === 0,
      aceitaHorasExtras: false,
    })),
    cargos: ["Sala"],
    disponibilidades: [],
    movimentos: [5, 6].flatMap((diaSemana) => PERIODOS_OPERACIONAIS.map((periodo) => ({
      diaSemana,
      periodo,
      nivel: "muito_alto",
    }))),
    necessidades: dias.flatMap((diaSemana) => PERIODOS_OPERACIONAIS.map((periodo) => ({
      diaSemana,
      periodo,
      zonaId: "sala",
      funcao: "Sala",
      minimo: 1,
      ideal: diaSemana >= 5 ? 2 : 1,
      maximo: diaSemana >= 5 ? 3 : 2,
    }))),
    turnosExistentes: [],
    historicoQuatroSemanas: [],
    turnosSemanaAnterior: [],
  };
}

function escolher(
  candidatos: TurnoCandidato[],
  dia: number,
  funcionarioId: string,
  tipo: "abertura" | "fechamento"
) {
  return candidatos
    .filter((item) =>
      item.diaSemana === dia &&
      item.funcionarioId === funcionarioId &&
      (tipo === "abertura" ? item.cobreAbertura : item.cobreFechamento)
    )
    .sort((a, b) => b.duracaoMinutos - a.duracaoMinutos || a.id.localeCompare(b.id))[0];
}

function legado(snapshotAtual: SnapshotSemanal): TurnoLegadoSombra[] {
  const candidatos = gerarCandidatosTurno(snapshotAtual);
  const turnos: TurnoCandidato[] = [];
  for (const dia of snapshotAtual.diasAbertos) {
    const abertura = escolher(candidatos, dia, snapshotAtual.funcionarios[dia % snapshotAtual.funcionarios.length].id, "abertura");
    const fechamento = escolher(candidatos, dia, snapshotAtual.funcionarios[(dia + 2) % snapshotAtual.funcionarios.length].id, "fechamento");
    if (abertura) turnos.push(abertura);
    if (fechamento && fechamento.funcionarioId !== abertura?.funcionarioId) turnos.push(fechamento);
  }
  return turnos.map((item) => ({
    id: `legado:${item.id}`,
    funcionario_id: item.funcionarioId,
    dia_semana: item.diaSemana,
    zona_id: item.zonaId,
    hora_inicio: item.horaInicio,
    hora_fim: item.horaFim,
  }));
}

test("CP-SAT real compara legado, heurística e solver em 5/15/30", { skip: !URL, timeout: 90_000 }, async (t) => {
  for (const quantidade of [5, 15, 30]) {
    const atual = snapshot(quantidade);
    const resultado = await executarModoSombra({
      snapshot: atual,
      turnosLegado: legado(atual),
      tempoLegadoMs: 1,
      executarCpSat: true,
      cpSatSolver: new CpSatSolverAdapter({
        url: URL,
        token: process.env.CP_SAT_SERVICE_TOKEN,
      }),
      limiteTempoMs: 30_000,
    });
    t.diagnostic(JSON.stringify({
      funcionarios: quantidade,
      cpSatStatus: resultado.cpSat.status,
      vencedor: resultado.comparacaoTres.vencedor,
      tempoCpSatMs: resultado.cpSat.tempoMs,
      ...("solver" in resultado.cpSat ? resultado.cpSat.solver : {}),
      qualidade: "metricas" in resultado.cpSat ? {
        ideal: resultado.cpSat.metricas.distanciaParaIdeal,
        excesso: resultado.cpSat.metricas.excessoAcimaMaximo,
        carga: resultado.cpSat.metricas.desvioProporcionalCarga,
        justica: resultado.cpSat.metricas.justicaHistorica,
      } : null,
      legado: {
        valido: resultado.legado.validacao.valida,
        ideal: resultado.legado.metricas.distanciaParaIdeal,
        excesso: resultado.legado.metricas.excessoAcimaMaximo,
        carga: resultado.legado.metricas.desvioProporcionalCarga,
        justica: resultado.legado.metricas.justicaHistorica,
      },
      heuristica: "metricas" in resultado.sombra ? {
        valido: resultado.sombra.validacao.valida,
        ideal: resultado.sombra.metricas.distanciaParaIdeal,
        excesso: resultado.sombra.metricas.excessoAcimaMaximo,
        carga: resultado.sombra.metricas.desvioProporcionalCarga,
        justica: resultado.sombra.metricas.justicaHistorica,
      } : { status: resultado.sombra.status },
    }));
    assert.equal(resultado.cpSat.status, "solucao_valida");
    assert.equal("validacao" in resultado.cpSat && resultado.cpSat.validacao.valida, true);
  }
});

test("comparação tripla CP-SAT é determinística", { skip: !URL, timeout: 30_000 }, async () => {
  const atual = snapshot(5);
  const adapter = new CpSatSolverAdapter({ url: URL, token: process.env.CP_SAT_SERVICE_TOKEN });
  const entrada = {
    snapshot: atual,
    turnosLegado: legado(atual),
    tempoLegadoMs: 1,
    executarCpSat: true,
    cpSatSolver: adapter,
    limiteTempoMs: 30_000,
  };
  const primeira = await executarModoSombra(entrada);
  const segunda = await executarModoSombra(entrada);
  assert.equal("solucao" in primeira.cpSat && "solucao" in segunda.cpSat, true);
  if (!("solucao" in primeira.cpSat) || !("solucao" in segunda.cpSat)) return;
  assert.deepEqual(primeira.cpSat.solucao, segunda.cpSat.solucao);
  assert.deepEqual(primeira.comparacaoTres, segunda.comparacaoTres);
});
