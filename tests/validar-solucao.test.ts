import assert from "node:assert/strict";
import test from "node:test";
import { validarSolucao, type SolucaoSemanal } from "../src/lib/escalas/validar-solucao.ts";
import { criarSolucaoSemanal } from "../src/lib/escalas/solucao-semanal.ts";
import type { SnapshotSemanal } from "../src/lib/escalas/snapshot-semanal.ts";

function snapshotBase(abertura = "09:00", fechamento = "18:30"): SnapshotSemanal {
  return {
    restaurante: {
      id: "r1",
      usaZonas: true,
      permiteIa: true,
      diasFuncionamento: [0],
      coberturaFdsPrioritaria: false,
      permiteHorarioRepartido: false,
      permiteHorasExtras: false,
      limiteHorasExtrasSemanais: 0,
    },
    semana: { escalaId: "e1", inicio: "2026-08-17", fim: "2026-08-23" },
    horarios: [{ diaSemana: 0, fechado: false, abertura, fechamento }],
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
    necessidades: ["Abertura", "Almoço", "Tarde", "Fechamento"].map((periodo) => ({
      diaSemana: 0,
      periodo,
      zonaId: "sala",
      funcao: "Sala",
      minimo: 1,
      ideal: 1,
      maximo: 1,
    })),
    turnosExistentes: [],
    historicoQuatroSemanas: [],
    turnosSemanaAnterior: [],
  };
}

function solucao(
  horaInicio = "09:00",
  horaFim = "18:30",
  snapshot = snapshotBase()
): SolucaoSemanal {
  return criarSolucaoSemanal(snapshot, [{
      funcionarioId: "maria",
      diaSemana: 0,
      zonaId: "sala",
      horaInicio,
      horaFim,
    }]);
}

function temErro(resultado: ReturnType<typeof validarSolucao>, codigo: string) {
  return resultado.erros.some((erro) => erro.codigo === codigo);
}

test("aceita solução completamente válida", () => {
  const resultado = validarSolucao(snapshotBase(), solucao());
  assert.equal(resultado.valida, true);
  assert.equal(resultado.metricas.coberturaMinimaPercentual, 100);
  assert.equal(resultado.metricas.periodosAbaixoMinimo, 0);
});

test("rejeita funcionário indisponível", () => {
  const snapshot = snapshotBase();
  snapshot.disponibilidades.push({ funcionarioId: "maria", diaSemana: 0, disponivel: false, periodo: null });
  assert.equal(temErro(validarSolucao(snapshot, solucao()), "FUNCIONARIO_INDISPONIVEL"), true);
});

test("rejeita turno fora do horário operacional", () => {
  assert.equal(temErro(validarSolucao(snapshotBase(), solucao("08:00", "18:30")), "FORA_DA_OPERACAO"), true);
});

test("aceita fechamento após meia-noite", () => {
  const resultado = validarSolucao(snapshotBase("18:00", "01:00"), solucao("18:00", "01:00"));
  assert.equal(resultado.valida, true);
  assert.equal(resultado.metricas.fechamentosPorFuncionario.maria, 1);
});

test("detecta sobreposição de turnos", () => {
  const atribuicao = solucao();
  atribuicao.turnos = [
    { ...atribuicao.turnos[0], horaFim: "16:00" },
    { ...atribuicao.turnos[0], horaInicio: "15:00" },
  ];
  assert.equal(temErro(validarSolucao(snapshotBase(), atribuicao), "SOBREPOSICAO"), true);
});

test("detecta descanso inferior a 11 horas", () => {
  const snapshot = snapshotBase();
  snapshot.restaurante.diasFuncionamento = [0, 1];
  snapshot.diasAbertos = [0, 1];
  snapshot.diasFechados = [2, 3, 4, 5, 6];
  snapshot.horarios.push({ diaSemana: 1, fechado: false, abertura: "09:00", fechamento: "23:00" });
  snapshot.necessidades = [];
  const atribuicao = criarSolucaoSemanal(snapshot, [
    { funcionarioId: "maria", diaSemana: 0, zonaId: "sala", horaInicio: "09:00", horaFim: "23:00" },
    { funcionarioId: "maria", diaSemana: 1, zonaId: "sala", horaInicio: "09:00", horaFim: "23:00" },
  ]);
  assert.equal(temErro(validarSolucao(snapshot, atribuicao), "DESCANSO_INSUFICIENTE"), true);
});

test("detecta sete dias consecutivos", () => {
  const snapshot = snapshotBase("09:00", "17:00");
  snapshot.restaurante.diasFuncionamento = [0, 1, 2, 3, 4, 5, 6];
  snapshot.diasAbertos = [0, 1, 2, 3, 4, 5, 6];
  snapshot.diasFechados = [];
  snapshot.horarios = snapshot.diasAbertos.map((diaSemana) => ({ diaSemana, fechado: false, abertura: "09:00", fechamento: "17:00" }));
  snapshot.necessidades = [];
  const atribuicao = criarSolucaoSemanal(snapshot, snapshot.diasAbertos.map((diaSemana) => ({
    funcionarioId: "maria", diaSemana, zonaId: "sala", horaInicio: "09:00", horaFim: "17:00",
  })));
  assert.equal(temErro(validarSolucao(snapshot, atribuicao), "SETE_DIAS_CONSECUTIVOS"), true);
});

test("detecta cobertura mínima ausente", () => {
  const snapshot = snapshotBase();
  assert.equal(temErro(validarSolucao(snapshot, criarSolucaoSemanal(snapshot, [])), "COBERTURA_MINIMA"), true);
});

test("detecta função obrigatória ausente", () => {
  const snapshot = snapshotBase();
  snapshot.necessidades[0].funcao = "Cozinha";
  assert.equal(temErro(validarSolucao(snapshot, solucao()), "FUNCAO_MINIMA"), true);
});

test("detecta abertura descoberta", () => {
  assert.equal(temErro(validarSolucao(snapshotBase(), solucao("10:00", "18:30")), "ABERTURA_DESCOBERTA"), true);
});

test("detecta fechamento descoberto", () => {
  assert.equal(temErro(validarSolucao(snapshotBase(), solucao("09:00", "18:00")), "FECHAMENTO_DESCOBERTO"), true);
});

test("turno cobrindo vários períodos satisfaz todos os slots atravessados", () => {
  const resultado = validarSolucao(snapshotBase(), solucao("09:00", "18:30"));
  assert.equal(resultado.metricas.coberturaMinimaEncontrada, 4);
  assert.equal(resultado.metricas.distanciaParaIdeal, 0);
});

test("validador aceita 9h líquidas e rejeita jornada diária de 11h", () => {
  const nove = validarSolucao(snapshotBase("09:00", "18:30"), solucao("09:00", "18:30"));
  assert.equal(temErro(nove, "LIMITE_JORNADA_DIARIA_EXCEDIDO"), false);
  const snapshot = snapshotBase("09:00", "20:30");
  const onze = validarSolucao(snapshot, solucao("09:00", "20:30"));
  const erro = onze.erros.find((item) => item.codigo === "LIMITE_JORNADA_DIARIA_EXCEDIDO");
  assert.ok(erro);
  assert.equal(erro.horasPlanejadas, 11);
  assert.equal(erro.limiteHoras, 9);
  assert.equal(erro.excessoHoras, 2);
});

test("considera descanso na fronteira com a semana anterior", () => {
  const snapshot = snapshotBase();
  snapshot.turnosSemanaAnterior.push({
    funcionarioId: "maria",
    semanaInicio: "2026-08-10",
    diaSemana: 6,
    periodo: "Fechamento",
    horaInicio: "18:00",
    horaFim: "23:00",
  });
  assert.equal(temErro(validarSolucao(snapshot, solucao()), "DESCANSO_INSUFICIENTE"), true);
});

test("cenário impossível devolve múltiplas violações detalhadas", () => {
  const snapshot = snapshotBase();
  const resultado = validarSolucao(snapshot, criarSolucaoSemanal(snapshot, []));
  assert.equal(resultado.valida, false);
  assert.ok(resultado.erros.length >= 6);
  assert.equal(temErro(resultado, "ABERTURA_DESCOBERTA"), true);
  assert.equal(temErro(resultado, "FECHAMENTO_DESCOBERTO"), true);
  assert.equal(resultado.metricas.coberturaMinimaPercentual, 0);
});

test("carga semanal acima do limite automático é hard constraint detalhada", () => {
  const snapshot = snapshotBase("09:00", "17:00");
  snapshot.restaurante.diasFuncionamento = [0, 1, 2, 3, 4, 5];
  snapshot.diasAbertos = [0, 1, 2, 3, 4, 5];
  snapshot.diasFechados = [6];
  snapshot.horarios = snapshot.diasAbertos.map((diaSemana) => ({
    diaSemana, fechado: false, abertura: "09:00", fechamento: "17:00",
  }));
  snapshot.necessidades = [];
  snapshot.funcionarios[0].cargaHorariaSemanalMax = 44;
  const atribuicao = criarSolucaoSemanal(snapshot, snapshot.diasAbertos.map((diaSemana) => ({
    funcionarioId: "maria", diaSemana, zonaId: "sala", horaInicio: "09:00", horaFim: "17:00",
  })));
  const resultado = validarSolucao(snapshot, atribuicao);
  const erro = resultado.erros.find((item) => item.codigo === "LIMITE_CARGA_SEMANAL_EXCEDIDO");
  assert.ok(erro);
  assert.equal(erro.cargaContratada, 44);
  assert.equal(erro.horasExtrasPermitidas, 0);
  assert.equal(erro.horasPlanejadas, 45);
  assert.equal(erro.excessoHoras, 1);
});
