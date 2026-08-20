import assert from "node:assert/strict";
import test from "node:test";
import {
  cabeNoLimiteDiarioAutomatico,
  criarContextoTemporalSemanal,
  inicioAutomaticoPermitido,
} from "../src/lib/escalas/contexto-temporal.ts";

test("classifica semana futura, atual e passada no fuso do restaurante", () => {
  const quinta = new Date("2026-08-20T14:30:00Z");
  assert.equal(criarContextoTemporalSemanal("2026-08-24", quinta, "Europe/Lisbon").classificacao, "futura");
  assert.equal(criarContextoTemporalSemanal("2026-08-17", quinta, "Europe/Lisbon").classificacao, "atual");
  assert.equal(criarContextoTemporalSemanal("2026-08-10", quinta, "Europe/Lisbon").classificacao, "passada");
});

test("quinta atual protege segunda a quarta e exige trinta minutos de antecedência", () => {
  const contexto = criarContextoTemporalSemanal(
    "2026-08-17", new Date("2026-08-20T14:30:00Z"), "Europe/Lisbon"
  );
  assert.deepEqual(contexto.diasPassados, [0, 1, 2]);
  assert.equal(inicioAutomaticoPermitido(contexto, 2, 18 * 60), false);
  assert.equal(inicioAutomaticoPermitido(contexto, 3, 9 * 60), false);
  assert.equal(inicioAutomaticoPermitido(contexto, 3, 16 * 60), true);
  assert.equal(inicioAutomaticoPermitido(contexto, 4, 9 * 60), true);
});

test("limite diário permite oito e nove horas, mas rejeita qualquer excesso", () => {
  assert.equal(cabeNoLimiteDiarioAutomatico(0, 8), true);
  assert.equal(cabeNoLimiteDiarioAutomatico(0, 9), true);
  assert.equal(cabeNoLimiteDiarioAutomatico(0, 9.01), false);
  assert.equal(cabeNoLimiteDiarioAutomatico(4, 4), true);
  assert.equal(cabeNoLimiteDiarioAutomatico(4, 6), false);
  assert.equal(cabeNoLimiteDiarioAutomatico(0, 11), false);
});
