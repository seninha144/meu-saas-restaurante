import assert from "node:assert/strict";
import test from "node:test";
import {
  agregarHistoricoTurnos,
  calcularReferenciasJustica,
  desempateSemanal,
  pontuarJusticaHistorica,
  type MetricasHistoricasFuncionario,
  type TurnoHistorico,
} from "../src/lib/escalas/historico.ts";
import {
  funcionarioAtendeFuncao,
  respeitaDescansoMinimo,
} from "../src/lib/escalas/regras-obrigatorias.ts";

const funcionario = "funcionario-1";
const historico: TurnoHistorico[] = [
  { funcionarioId: funcionario, semanaInicio: "2026-07-06", diaSemana: 5, periodo: "Fechamento", horaInicio: "18:00", horaFim: "01:00" },
  { funcionarioId: funcionario, semanaInicio: "2026-07-06", diaSemana: 6, periodo: "Manhã", horaInicio: "09:00", horaFim: "17:00" },
  { funcionarioId: funcionario, semanaInicio: "2026-07-13", diaSemana: 5, periodo: "Fechamento", horaInicio: "17:00", horaFim: "02:00" },
  { funcionarioId: funcionario, semanaInicio: "2026-07-20", diaSemana: 0, periodo: "Tarde", horaInicio: "12:00", horaFim: "18:00" },
  { funcionarioId: funcionario, semanaInicio: "2026-07-27", diaSemana: 5, periodo: "Fechamento", horaInicio: "18:00", horaFim: "01:00" },
  { funcionarioId: funcionario, semanaInicio: "2026-07-27", diaSemana: 6, periodo: "Noite", horaInicio: "17:00", horaFim: "23:00" },
];

test("agrega quatro semanas e contabiliza turnos após meia-noite", () => {
  const metricas = agregarHistoricoTurnos(historico, "2026-08-03").get(funcionario);
  assert.deepEqual(metricas, {
    fechamentos: 3,
    aberturas: 1,
    sabadosTrabalhados: 3,
    domingosTrabalhados: 2,
    finsDeSemanaCompletos: 2,
    turnosPorPeriodo: { Manhã: 1, Tarde: 1, Noite: 1, Fechamento: 3 },
    horasPlanejadas: 43,
    padraoSemanaAnterior: ["5:Fechamento", "6:Noite"],
  });
});

test("mantém métricas separadas por funcionário", () => {
  const turnos = [...historico, { ...historico[0], funcionarioId: "funcionario-2" }];
  const metricas = agregarHistoricoTurnos(turnos, "2026-08-03");
  assert.equal(metricas.get("funcionario-2")?.horasPlanejadas, 7);
  assert.equal(metricas.get("funcionario-2")?.fechamentos, 1);
});

test("inclui funcionário sem histórico com métricas zeradas", () => {
  const metricas = agregarHistoricoTurnos(historico, "2026-08-03", ["sem-turnos"]);
  assert.equal(metricas.get("sem-turnos")?.horasPlanejadas, 0);
  assert.deepEqual(metricas.get("sem-turnos")?.padraoSemanaAnterior, []);
});

function criarMetricas(
  parcial: Partial<MetricasHistoricasFuncionario> = {}
): MetricasHistoricasFuncionario {
  return {
    fechamentos: 0,
    aberturas: 0,
    sabadosTrabalhados: 0,
    domingosTrabalhados: 0,
    finsDeSemanaCompletos: 0,
    turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 0 },
    horasPlanejadas: 0,
    padraoSemanaAnterior: [],
    ...parcial,
  };
}

function scoreEntre(
  a: MetricasHistoricasFuncionario,
  b: MetricasHistoricasFuncionario,
  cargaA = 40,
  cargaB = 40,
  dia = 5,
  periodo: "Manhã" | "Tarde" | "Noite" | "Fechamento" = "Fechamento"
) {
  const metricas = new Map([["a", a], ["b", b]]);
  const cargas = new Map([["a", cargaA], ["b", cargaB]]);
  const referencia = calcularReferenciasJustica(metricas, cargas);
  return {
    a: pontuarJusticaHistorica(a, cargaA, referencia, dia, periodo),
    b: pontuarJusticaHistorica(b, cargaB, referencia, dia, periodo),
  };
}

test("menos fechamentos e menos sábados recebem prioridade", () => {
  const fechamentos = scoreEntre(
    criarMetricas({ fechamentos: 4, turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 4 } }),
    criarMetricas({ fechamentos: 1, turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 1 } }),
    40,
    40,
    0
  );
  assert.ok(fechamentos.b > fechamentos.a);

  const sabados = scoreEntre(
    criarMetricas({ sabadosTrabalhados: 4 }),
    criarMetricas({ sabadosTrabalhados: 1 }),
    40,
    40,
    5,
    "Tarde"
  );
  assert.ok(sabados.b > sabados.a);
});

test("normaliza justiça pela carga semanal de 40h e 20h", () => {
  const scores = scoreEntre(
    criarMetricas({ fechamentos: 4, horasPlanejadas: 160, turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 4 } }),
    criarMetricas({ fechamentos: 2, horasPlanejadas: 80, turnosPorPeriodo: { Manhã: 0, Tarde: 0, Noite: 0, Fechamento: 2 } }),
    40,
    20,
    0
  );
  assert.equal(scores.a, scores.b);
});

test("penaliza repetição do mesmo dia e período da semana anterior", () => {
  const scores = scoreEntre(
    criarMetricas({ padraoSemanaAnterior: ["5:Fechamento"] }),
    criarMetricas()
  );
  assert.equal(scores.b - scores.a, 10);
});

test("desempate é estável na mesma semana e pode variar em outra", () => {
  const chave = "2026-08-03:funcionario-a:5:Fechamento:zona-1";
  assert.equal(desempateSemanal(chave), desempateSemanal(chave));

  const vencedores = new Set<string>();
  for (let semana = 0; semana < 20; semana++) {
    const a = desempateSemanal(`semana-${semana}:a:5:Fechamento:zona`);
    const b = desempateSemanal(`semana-${semana}:b:5:Fechamento:zona`);
    vencedores.add(a > b ? "a" : "b");
  }
  assert.equal(vencedores.size, 2);
});

test("regras obrigatórias e função continuam anteriores à justiça", () => {
  const candidatoHistoricamenteFavorecido = criarMetricas();
  const referencia = calcularReferenciasJustica(
    new Map([["a", candidatoHistoricamenteFavorecido]]),
    new Map([["a", 40]])
  );
  assert.ok(pontuarJusticaHistorica(candidatoHistoricamenteFavorecido, 40, referencia, 0, "Manhã") >= 0);
  assert.equal(
    respeitaDescansoMinimo([{ inicio: 18 * 60, fim: 25 * 60 }], { inicio: 33 * 60, fim: 41 * 60 }),
    false
  );
  assert.equal(funcionarioAtendeFuncao("Empregado de mesa", "Cozinheiro"), false);
});

test("restaurante sem histórico mantém score neutro", () => {
  const metricas = agregarHistoricoTurnos([], "2026-08-03", ["a", "b"]);
  const referencia = calcularReferenciasJustica(metricas, new Map([["a", 40], ["b", 20]]));
  assert.equal(pontuarJusticaHistorica(metricas.get("a")!, 40, referencia, 5, "Fechamento"), 0);
  assert.equal(pontuarJusticaHistorica(metricas.get("b")!, 20, referencia, 5, "Fechamento"), 0);
});
