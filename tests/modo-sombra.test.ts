import assert from "node:assert/strict";
import test from "node:test";
import { gerarCandidatosTurno, type TurnoCandidato } from "../src/lib/escalas/candidatos-turno.ts";
import {
  converterLegadoParaSolucaoSemanal,
  executarModoSombra,
  type TurnoLegadoSombra,
} from "../src/lib/escalas/modo-sombra.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";
import { PERIODOS_OPERACIONAIS, type PeriodoOperacional } from "../src/types/dominio.ts";

interface OpcoesCenario {
  abertura?: string;
  fechamento?: string;
  historico?: boolean;
  picoFimDeSemana?: boolean;
  baixaDisponibilidade?: boolean;
  impossivel?: boolean;
}

function snapshotCenario(quantidade: number, opcoes: OpcoesCenario = {}): SnapshotSemanal {
  const dias = [0, 1, 2, 3, 4, 5, 6];
  const funcionarios = Array.from({ length: quantidade }, (_, indice) => ({
    id: `f-${String(indice).padStart(2, "0")}`,
    cargo: "Cozinha",
    zonaId: "cozinha",
    cargaHorariaSemanalMax: indice % 3 === 0 ? 20 : 40,
    pausaAlmocoMinutos: 30,
    diasTrabalhoAlvo: 5,
    podeAbertura: true,
    podeFechamento: true,
    aceitaHorarioRepartido: indice % 2 === 0,
    aceitaHorasExtras: false,
  }));
  const indisponiveis = opcoes.impossivel
    ? funcionarios
    : opcoes.baixaDisponibilidade
      ? funcionarios.slice(0, Math.max(0, quantidade - 2))
      : [];

  return {
    restaurante: {
      id: "restaurante-sombra",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: dias,
      coberturaFdsPrioritaria: opcoes.picoFimDeSemana ?? false,
      permiteHorarioRepartido: true,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "escala-sombra", inicio: "2026-08-24", fim: "2026-08-30" },
    horarios: dias.map((diaSemana) => ({
      diaSemana,
      fechado: false,
      abertura: opcoes.abertura ?? "09:00",
      fechamento: opcoes.fechamento ?? "23:00",
    })),
    diasAbertos: dias,
    diasFechados: [],
    zonas: [{ id: "cozinha", capacidadeMinima: 1 }],
    funcionarios,
    cargos: ["Cozinha"],
    disponibilidades: indisponiveis.flatMap((funcionario) =>
      dias.map((diaSemana) => ({
        funcionarioId: funcionario.id,
        diaSemana,
        disponivel: false,
        periodo: "Total",
      }))
    ),
    movimentos: opcoes.picoFimDeSemana
      ? [5, 6].flatMap((diaSemana) => PERIODOS_OPERACIONAIS.map((periodo) => ({
          diaSemana,
          periodo,
          nivel: "muito_alto",
        })))
      : [],
    necessidades: dias.flatMap((diaSemana) =>
      PERIODOS_OPERACIONAIS.map((periodo: PeriodoOperacional) => ({
        diaSemana,
        periodo,
        zonaId: "cozinha",
        funcao: "Cozinha",
        minimo: 1,
        ideal: opcoes.picoFimDeSemana && diaSemana >= 5 ? 2 : 1,
        maximo: opcoes.picoFimDeSemana && diaSemana >= 5 ? 3 : 2,
      }))
    ),
    turnosExistentes: [],
    historicoQuatroSemanas: opcoes.historico
      ? Array.from({ length: 4 }, (_, indice) => ({
          funcionarioId: "f-00",
          semanaInicio: `2026-07-${27 - indice * 7}`,
          diaSemana: 5,
          periodo: "Fechamento" as const,
          horaInicio: "16:00",
          horaFim: "23:00",
        }))
      : [],
    turnosSemanaAnterior: [],
  };
}

function melhorCandidato(
  candidatos: TurnoCandidato[],
  predicado: (item: TurnoCandidato) => boolean,
  usados: Set<string>
) {
  return candidatos
    .filter((item) => predicado(item) && !usados.has(`${item.funcionarioId}:${item.diaSemana}`))
    .sort((a, b) => b.duracaoMinutos - a.duracaoMinutos || a.id.localeCompare(b.id))[0];
}

function legadoSintetico(snapshot: SnapshotSemanal): TurnoLegadoSombra[] {
  const candidatos = gerarCandidatosTurno(snapshot);
  const usados = new Set<string>();
  const escolhidos: TurnoCandidato[] = [];
  const funcionariosJornadaCompleta = snapshot.funcionarios.filter(
    (funcionario) => funcionario.cargaHorariaSemanalMax >= 40
  );
  for (const dia of snapshot.diasAbertos) {
    const alvoAbertura = funcionariosJornadaCompleta[dia % funcionariosJornadaCompleta.length]?.id;
    const alvoFechamento = funcionariosJornadaCompleta[(dia + 2) % funcionariosJornadaCompleta.length]?.id;
    const predicadoAbertura = (item: TurnoCandidato) =>
      item.diaSemana === dia && item.cobreAbertura;
    const abertura = melhorCandidato(
      candidatos,
      (item) => predicadoAbertura(item) && item.funcionarioId === alvoAbertura,
      usados
    ) ?? melhorCandidato(candidatos, predicadoAbertura, usados);
    if (abertura) {
      escolhidos.push(abertura);
      usados.add(`${abertura.funcionarioId}:${dia}`);
    }
    if (abertura?.cobreFechamento) continue;
    const predicadoFechamento = (item: TurnoCandidato) =>
      item.diaSemana === dia && item.cobreFechamento;
    const fechamento = melhorCandidato(
      candidatos,
      (item) => predicadoFechamento(item) && item.funcionarioId === alvoFechamento,
      usados
    ) ?? melhorCandidato(candidatos, predicadoFechamento, usados);
    if (fechamento) {
      escolhidos.push(fechamento);
      usados.add(`${fechamento.funcionarioId}:${dia}`);
    }
  }
  return escolhidos.map((item) => ({
    id: `legado:${item.id}`,
    funcionario_id: item.funcionarioId,
    dia_semana: item.diaSemana,
    zona_id: item.zonaId,
    hora_inicio: item.horaInicio,
    hora_fim: item.horaFim,
  }));
}

async function comparar(snapshot: SnapshotSemanal) {
  return executarModoSombra({
    snapshot,
    turnosLegado: legadoSintetico(snapshot),
    tempoLegadoMs: 1,
    limiteTempoMs: 30_000,
  });
}

test("converte o resultado legado sem depender da persistência", () => {
  const snapshot = snapshotCenario(5);
  const solucao = converterLegadoParaSolucaoSemanal(snapshot, legadoSintetico(snapshot));
  assert.equal(solucao.turnos.length > 0, true);
  assert.doesNotThrow(() => JSON.stringify(solucao));
});

test("modo sombra é determinístico para os mesmos dados e semana", async () => {
  const snapshot = snapshotCenario(5, { historico: true });
  const primeira = await comparar(snapshot);
  const segunda = await comparar(snapshot);
  assert.equal("solucao" in primeira.sombra, true);
  assert.equal("solucao" in segunda.sombra, true);
  if (!("solucao" in primeira.sombra) || !("solucao" in segunda.sombra)) return;
  assert.deepEqual(primeira.sombra.solucao, segunda.sombra.solucao);
  assert.deepEqual(primeira.comparacao, segunda.comparacao);
});

test("cenários 5/15/30 produzem comparação serializável", async (t) => {
  const contagem = { legado: 0, sombra: 0, empate: 0, sem_comparacao: 0 };
  for (const quantidade of [5, 15, 30]) {
    const resultado = await comparar(snapshotCenario(quantidade));
    contagem[resultado.comparacao.vencedor]++;
    t.diagnostic(JSON.stringify({
      funcionarios: quantidade,
      vencedor: resultado.comparacao.vencedor,
      nivel: resultado.comparacao.nivelDecisivo,
      candidatos: gerarCandidatosTurno(snapshotCenario(quantidade)).length,
      tempoSombraMs: resultado.sombra.tempoMs,
      legadoErros: resultado.legado.validacao.erros.slice(0, 2).map((erro) => erro.codigo),
    }));
    assert.doesNotThrow(() => JSON.stringify(resultado));
    assert.notEqual(resultado.comparacao.vencedor, "sem_comparacao");
  }
  t.diagnostic(`placar=${JSON.stringify(contagem)}`);
});

test("pico de fim de semana e funções obrigatórias são comparados", async () => {
  const resultado = await comparar(snapshotCenario(5, { picoFimDeSemana: true }));
  assert.equal("validacao" in resultado.sombra, true);
  assert.equal(resultado.comparacao.diferencas.some((item) => item.metrica === "funcoesAbaixoMinimo"), true);
});

test("abertura, fechamento 00:00 e após meia-noite permanecem válidos", async () => {
  for (const [abertura, fechamento] of [["18:00", "00:00"], ["18:00", "01:00"]]) {
    const resultado = await comparar(snapshotCenario(5, { abertura, fechamento }));
    assert.equal("validacao" in resultado.sombra && resultado.sombra.validacao.valida, true);
    assert.equal("metricas" in resultado.sombra && resultado.sombra.metricas.aberturas > 0, true);
    assert.equal("metricas" in resultado.sombra && resultado.sombra.metricas.fechamentos > 0, true);
  }
});

test("histórico desigual, baixa disponibilidade e ausência de histórico são suportados", async () => {
  const desigual = await comparar(snapshotCenario(5, { historico: true }));
  const baixa = await comparar(snapshotCenario(5, { baixaDisponibilidade: true }));
  const semHistorico = await comparar(snapshotCenario(5));
  assert.equal(Number.isFinite(desigual.legado.metricas.justicaHistorica), true);
  assert.equal(
    ["solucao_valida", "nenhuma_solucao_encontrada"].includes(baixa.sombra.status),
    true
  );
  assert.equal(Number.isFinite(semHistorico.legado.metricas.justicaHistorica), true);
});

test("cenário impossível informa falha heurística sem alegar inviabilidade matemática", async () => {
  const resultado = await comparar(snapshotCenario(5, { impossivel: true }));
  assert.equal(resultado.sombra.status, "nenhuma_solucao_encontrada");
  assert.equal(resultado.comparacao.vencedor, "sem_comparacao");
  assert.match("diagnostico" in resultado.sombra ? resultado.sombra.diagnostico : "", /heurística/i);
  assert.doesNotMatch("diagnostico" in resultado.sombra ? resultado.sombra.diagnostico : "", /matematicamente inviável/i);
});
