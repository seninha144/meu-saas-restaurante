import assert from "node:assert/strict";
import test from "node:test";
import {
  cabeNoLimiteAutomatico,
  horasExtrasPermitidas,
  limiteAutomaticoFuncionario,
} from "../src/lib/escalas/limite-carga-semanal.ts";

const funcionario = (aceitaHorasExtras: boolean, cargaHorariaSemanalMax = 40) => ({
  aceitaHorasExtras,
  cargaHorariaSemanalMax,
});
const restaurante = (permiteHorasExtras: boolean, limiteHorasExtrasSemanais: number) => ({
  permiteHorasExtras,
  limiteHorasExtrasSemanais,
});

test("sem autorização bilateral não concede horas extras", () => {
  assert.equal(horasExtrasPermitidas(restaurante(false, 2), funcionario(true)), 0);
  assert.equal(horasExtrasPermitidas(restaurante(true, 2), funcionario(false)), 0);
});

test("autoriza somente a margem configurada de uma ou duas horas", () => {
  assert.equal(limiteAutomaticoFuncionario(restaurante(true, 1), funcionario(true)), 41);
  assert.equal(limiteAutomaticoFuncionario(restaurante(true, 2), funcionario(true)), 42);
});

test("part-time de 20h com duas horas extras nunca ultrapassa 22h", () => {
  const limite = limiteAutomaticoFuncionario(restaurante(true, 2), funcionario(true, 20));
  assert.equal(limite, 22);
  assert.equal(cabeNoLimiteAutomatico(20, 2, limite), true);
  assert.equal(cabeNoLimiteAutomatico(20, 2.01, limite), false);
});

test("regressão legado: contrato de 44h não pode chegar a 52,8h para cobrir vagas", () => {
  const limite = limiteAutomaticoFuncionario(restaurante(false, 0), funcionario(false, 44));
  assert.equal(limite, 44);
  assert.equal(cabeNoLimiteAutomatico(44, 8.8, limite), false);
});
