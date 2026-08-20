import assert from "node:assert/strict";
import test from "node:test";
import { avaliarSolucao, compararAvaliacoes } from "../src/lib/escalas/avaliar-solucao.ts";
import { criarSolucaoSemanal } from "../src/lib/escalas/solucao-semanal.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";
import { validarSolucao, type ResultadoValidacaoSolucao } from "../src/lib/escalas/validar-solucao.ts";
import { criarContextoTemporalSemanal } from "../src/lib/escalas/contexto-temporal.ts";
import { cargaAlvoPlanejavel } from "../src/lib/escalas/carga-planejavel.ts";

const PERIODOS = ["Abertura", "Almoço", "Tarde", "Fechamento"];

function snapshotBase(dias = [0]): SnapshotSemanal {
  return {
    restaurante: {
      id: "r1",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: dias,
      coberturaFdsPrioritaria: false,
      permiteHorarioRepartido: false,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "e1", inicio: "2026-08-17", fim: "2026-08-23" },
    horarios: dias.map((diaSemana) => ({
      diaSemana,
      fechado: false,
      abertura: "09:00",
      fechamento: "17:00",
    })),
    diasAbertos: dias,
    diasFechados: [0, 1, 2, 3, 4, 5, 6].filter((dia) => !dias.includes(dia)),
    zonas: [{ id: "sala", capacidadeMinima: 1 }],
    funcionarios: ["maria", "joao"].map((id) => ({
      id,
      cargo: "Sala",
      zonaId: "sala",
      cargaHorariaSemanalMax: 8,
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

function turno(funcionarioId: string, diaSemana = 0, horaInicio = "09:00", horaFim = "17:00") {
  return { funcionarioId, diaSemana, zonaId: "sala", horaInicio, horaFim };
}

function avaliar(snapshot: SnapshotSemanal, turnos: ReturnType<typeof turno>[]) {
  const solucao = criarSolucaoSemanal(snapshot, turnos);
  const validacao = validarSolucao(snapshot, solucao);
  return { solucao, validacao, avaliacao: avaliarSolucao(snapshot, solucao, validacao) };
}

test("solução inválida nunca vence solução válida", () => {
  const snapshot = snapshotBase();
  const valida = avaliar(snapshot, [turno("maria")]);
  const invalida = avaliar(snapshot, []);
  assert.equal(compararAvaliacoes(valida.avaliacao, invalida.avaliacao) < 0, true);
});

test("atingir ideal vence ficar apenas no mínimo", () => {
  const snapshot = snapshotBase();
  snapshot.necessidades.forEach((item) => {
    item.ideal = 2;
    item.maximo = 2;
  });
  const minimo = avaliar(snapshot, [turno("maria")]);
  const ideal = avaliar(snapshot, [turno("maria"), turno("joao")]);
  assert.equal(compararAvaliacoes(ideal.avaliacao, minimo.avaliacao) < 0, true);
  assert.equal(ideal.avaliacao.niveis.coberturaIdeal.custo, 0);
});

test("menor excesso acima do máximo vence", () => {
  const snapshot = snapshotBase();
  snapshot.necessidades.forEach((item) => {
    item.maximo = 1;
  });
  const semExcesso = avaliar(snapshot, [turno("maria")]);
  const comExcesso = avaliar(snapshot, [turno("maria"), turno("joao")]);
  assert.equal(compararAvaliacoes(semExcesso.avaliacao, comExcesso.avaliacao) < 0, true);
});

test("carga mais equilibrada vence quando cobertura e máximo empatam", () => {
  const snapshot = snapshotBase([0, 1]);
  const equilibrada = avaliar(snapshot, [turno("maria", 0), turno("joao", 1)]);
  const concentrada = avaliar(snapshot, [turno("maria", 0), turno("maria", 1)]);
  assert.equal(equilibrada.avaliacao.niveis.carga.custo < concentrada.avaliacao.niveis.carga.custo, true);
  assert.equal(compararAvaliacoes(equilibrada.avaliacao, concentrada.avaliacao) < 0, true);
});

test("justiça histórica vence quando níveis anteriores empatam", () => {
  const snapshot = snapshotBase();
  snapshot.historicoQuatroSemanas = [0, 1, 2, 3].map((indice) => ({
    funcionarioId: "maria",
    semanaInicio: `2026-07-${20 + indice}`,
    diaSemana: 0,
    periodo: "Manhã",
    horaInicio: "09:00",
    horaFim: "17:00",
  }));
  const maria = avaliar(snapshot, [turno("maria")]);
  const joao = avaliar(snapshot, [turno("joao")]);
  assert.equal(joao.avaliacao.niveis.justica.custo < maria.avaliacao.niveis.justica.custo, true);
  assert.equal(compararAvaliacoes(joao.avaliacao, maria.avaliacao) < 0, true);
});

test("preferências só decidem depois dos níveis superiores", () => {
  const snapshot = snapshotBase();
  snapshot.disponibilidades.push(
    { funcionarioId: "maria", diaSemana: 0, disponivel: true, periodo: "Fechamento" },
    { funcionarioId: "joao", diaSemana: 0, disponivel: true, periodo: "Total" }
  );
  const preferida = avaliar(snapshot, [turno("maria")]);
  const foraPreferencia = avaliar(snapshot, [turno("joao")]);
  assert.deepEqual(
    preferida.avaliacao.chaveComparacao.slice(0, 5),
    foraPreferencia.avaliacao.chaveComparacao.slice(0, 5)
  );
  assert.equal(preferida.avaliacao.niveis.preferencias.custo < foraPreferencia.avaliacao.niveis.preferencias.custo, true);
});

test("part-time e full-time são comparados proporcionalmente", () => {
  const snapshot = snapshotBase();
  snapshot.funcionarios[0].cargaHorariaSemanalMax = 40;
  snapshot.funcionarios[1].cargaHorariaSemanalMax = 20;
  const base = avaliar(snapshot, [turno("maria")]);
  const metricas = { ...base.validacao.metricas, horasPorFuncionario: { maria: 20, joao: 10 } };
  const metade: ResultadoValidacaoSolucao = { ...base.validacao, metricas };
  const avaliacao = avaliarSolucao(snapshot, base.solucao, metade);
  assert.equal(avaliacao.niveis.carga.desvioProporcionalMedio, 0.5);
});

test("mesma solução produz exatamente a mesma avaliação", () => {
  const snapshot = snapshotBase();
  const item = avaliar(snapshot, [turno("maria")]);
  assert.deepEqual(
    avaliarSolucao(snapshot, item.solucao, item.validacao),
    avaliarSolucao(snapshot, item.solucao, item.validacao)
  );
});

test("empate exato usa desempate determinístico", () => {
  const snapshot = snapshotBase();
  const maria = avaliar(snapshot, [turno("maria")]);
  const joao = avaliar(snapshot, [turno("joao")]);
  assert.deepEqual(maria.avaliacao.chaveComparacao.slice(0, 6), joao.avaliacao.chaveComparacao.slice(0, 6));
  assert.notEqual(maria.avaliacao.desempateDeterministico, joao.avaliacao.desempateDeterministico);
  const primeira = compararAvaliacoes(maria.avaliacao, joao.avaliacao);
  const segunda = compararAvaliacoes(maria.avaliacao, joao.avaliacao);
  assert.notEqual(primeira, 0);
  assert.equal(primeira, segunda);
});

test("cenário sem histórico continua funcionando", () => {
  const item = avaliar(snapshotBase(), [turno("maria")]);
  assert.equal(Number.isFinite(item.avaliacao.niveis.justica.custo), true);
  assert.equal(item.avaliacao.valida, true);
});

test("uso de hora extra perde apenas depois de cobertura ideal e excesso máximo", () => {
  const snapshot = snapshotBase();
  snapshot.restaurante.permiteHorasExtras = true;
  snapshot.restaurante.limiteHorasExtrasSemanais = 2;
  snapshot.funcionarios[0].aceitaHorasExtras = true;
  const base = avaliar(snapshot, [turno("maria")]);
  const semExtra = avaliarSolucao(snapshot, base.solucao, {
    ...base.validacao,
    metricas: { ...base.validacao.metricas, horasPorFuncionario: { maria: 8, joao: 0 } },
  });
  const comExtra = avaliarSolucao(snapshot, base.solucao, {
    ...base.validacao,
    metricas: { ...base.validacao.metricas, horasPorFuncionario: { maria: 9, joao: 0 } },
  });
  assert.equal(comExtra.niveis.horasExtras.horasExtrasUtilizadas, 1);
  assert.equal(compararAvaliacoes(semExtra, comExtra) < 0, true);
});

test("semana em andamento usa somente a capacidade segura restante como meta", () => {
  const snapshot = snapshotBase([0, 1, 2, 3, 4, 5, 6]);
  snapshot.funcionarios[0].cargaHorariaSemanalMax = 40;
  snapshot.temporal = criarContextoTemporalSemanal(
    "2026-08-17", new Date("2026-08-20T07:00:00Z"), "Europe/Lisbon"
  );
  assert.equal(cargaAlvoPlanejavel(snapshot, snapshot.funcionarios[0]), 30);
});
