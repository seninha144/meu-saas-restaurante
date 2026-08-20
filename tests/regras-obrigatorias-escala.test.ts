import assert from "node:assert/strict";
import test from "node:test";
import {
  agruparMinimosPorFuncao,
  alertaCoberturaImpossivel,
  calcularJornadaOperacional,
  funcionarioAtendeFuncao,
  horasExtrasParaCoberturaObrigatoria,
  obterFalhasNasExtremidades,
  podeAssumirResponsabilidade,
  podeRemoverDiaSemDescobrirCobertura,
  pontuarCoberturaDia,
  respeitaDescansoMinimo,
  respeitaMaximoDiasConsecutivos,
} from "../src/lib/escalas/regras-obrigatorias.ts";
import { intervaloEmMinutos } from "../src/lib/horas.ts";

test("exige onze horas de descanso entre jornadas", () => {
  const anterior = { inicio: 9 * 60, fim: 17 * 60 };
  assert.equal(respeitaDescansoMinimo([anterior], { inicio: 28 * 60, fim: 36 * 60 }), true);
  assert.equal(respeitaDescansoMinimo([anterior], { inicio: 27 * 60, fim: 35 * 60 }), false);
});

test("impede fechamento seguido de abertura com descanso insuficiente", () => {
  const fechamento = { inicio: 18 * 60, fim: 25 * 60 };
  const aberturaSeguinte = { inicio: 33 * 60, fim: 41 * 60 };
  assert.equal(respeitaDescansoMinimo([fechamento], aberturaSeguinte), false);
});

test("impede o sétimo dia consecutivo inclusive na fronteira semanal", () => {
  assert.equal(respeitaMaximoDiasConsecutivos([-3, -2, -1, 0, 1, 2], 3), false);
  assert.equal(respeitaMaximoDiasConsecutivos([-2, -1, 0, 1, 2], 3), true);
});

test("agrupa a cobertura mínima obrigatória por função", () => {
  const minimos = agruparMinimosPorFuncao([
    { funcao: "Cozinheiro", minimo: 2 },
    { funcao: " cozinheiro ", minimo: 1 },
    { funcao: "Empregado de mesa", minimo: 2 },
    { funcao: null, minimo: 5 },
  ]);
  assert.deepEqual([...minimos], [["cozinheiro", 3], ["empregado de mesa", 2]]);
  assert.equal(funcionarioAtendeFuncao("Cozinheiro", " cozinheiro "), true);
  assert.equal(funcionarioAtendeFuncao("Empregado de mesa", "Cozinheiro"), false);
});

test("evita concentrar três folgas quando a cobertura fica abaixo do mínimo", () => {
  const quintaComTresFolgas = pontuarCoberturaDia(2, 3, 4);
  const outroDiaCoberto = pontuarCoberturaDia(3, 3, 4);
  assert.ok(quintaComTresFolgas > outroDiaCoberto);
});

test("permite várias folgas quando a cobertura continua suficiente", () => {
  // Quatro pessoas podem folgar numa equipa de oito se as quatro restantes atingem o ideal.
  const score = pontuarCoberturaDia(4, 3, 4);
  assert.equal(score, -100);
});

test("cobertura abaixo do mínimo prevalece sobre ajustes históricos", () => {
  const diaAbaixoDoMinimo = pontuarCoberturaDia(2, 3, 4) - 50;
  const diaCobertoComVantagemHistorica = pontuarCoberturaDia(3, 3, 4) + 50;
  assert.ok(diaAbaixoDoMinimo > diaCobertoComVantagemHistorica);
});

test("dia aberto não perde candidato válido por já ter atingido a meta semanal", () => {
  assert.equal(horasExtrasParaCoberturaObrigatoria(40, 5, 8), 8);
});

test("folga não vence a cobertura mínima", () => {
  assert.equal(podeRemoverDiaSemDescobrirCobertura(2, 2), false);
  assert.equal(podeRemoverDiaSemDescobrirCobertura(3, 2), true);
});

test("carga semanal esgotada não vence cobertura obrigatória", () => {
  const horasRestantes = 0;
  const horasCobertura = horasRestantes || horasExtrasParaCoberturaObrigatoria(40, 5, 10);
  assert.equal(horasCobertura, 8);
});

test("caso matematicamente impossível gera alerta explícito", () => {
  assert.equal(alertaCoberturaImpossivel(0), null);
  assert.match(alertaCoberturaImpossivel(2) ?? "", /Cobertura impossível: 2 requisito/);
});

test("ancora responsáveis na abertura e no fechamento real", () => {
  assert.deepEqual(
    calcularJornadaOperacional(9 * 60, 23 * 60, 12 * 60, 8 * 60, "abertura"),
    { inicio: 9 * 60, fim: 17 * 60 }
  );
  assert.deepEqual(
    calcularJornadaOperacional(9 * 60, 23 * 60, 17 * 60, 8 * 60, "fechamento"),
    { inicio: 15 * 60, fim: 23 * 60 }
  );
});

test("fechamento após meia-noite termina no horário real", () => {
  assert.deepEqual(
    calcularJornadaOperacional(18 * 60, 25 * 60, 22 * 60, 6 * 60, "fechamento"),
    { inicio: 19 * 60, fim: 25 * 60 }
  );
});

test("sábado fechando 00:00 continua ancorado no fim real", () => {
  const sabado = 5;
  const horario = intervaloEmMinutos("18:00", "00:00");
  const jornada = calcularJornadaOperacional(
    horario.inicio,
    horario.fim,
    22 * 60,
    6 * 60,
    "fechamento"
  );

  assert.deepEqual(jornada, { inicio: 18 * 60, fim: 24 * 60 });
  assert.equal(sabado * 24 * 60 + jornada.fim, 6 * 24 * 60);
});

test("funcionário não apto não cobre fechamento e gera falha", () => {
  assert.equal(podeAssumirResponsabilidade(true, false, "fechamento"), false);
  assert.deepEqual(
    obterFalhasNasExtremidades(
      [{
        periodo: "Fechamento",
        horaInicio: "12:00",
        horaFim: "23:00",
        podeAbertura: true,
        podeFechamento: false,
      }],
      "09:00",
      "23:00"
    ),
    ["abertura", "fechamento"]
  );
});

test("um responsável basta quando o mínimo da abertura é um", () => {
  assert.deepEqual(
    obterFalhasNasExtremidades(
      [{
        periodo: "Manhã",
        horaInicio: "09:00",
        horaFim: "17:00",
        podeAbertura: true,
        podeFechamento: false,
      }],
      "09:00",
      "23:00"
    ),
    ["fechamento"]
  );
});
