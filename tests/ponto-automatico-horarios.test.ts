import assert from "node:assert/strict";
import test from "node:test";
import { intervaloDoTurno, horarioLocalParaUTC } from "../src/lib/ponto-automatico/horarios.ts";

test("mantém 18:00 de Lisboa no horário de verão", () => {
  assert.equal(horarioLocalParaUTC({ ano: 2026, mes: 7, dia: 15 }, "18:00", "Europe/Lisbon").toISOString(), "2026-07-15T17:00:00.000Z");
});
test("mantém 18:00 de Lisboa no horário de inverno", () => {
  assert.equal(horarioLocalParaUTC({ ano: 2026, mes: 1, dia: 15 }, "18:00", "Europe/Lisbon").toISOString(), "2026-01-15T18:00:00.000Z");
});
test("turno que atravessa meia-noite termina no dia seguinte", () => {
  const intervalo = intervaloDoTurno({ ano: 2026, mes: 7, dia: 15 }, "18:00", "01:00", "Europe/Lisbon");
  assert.equal(intervalo.inicio.toISOString(), "2026-07-15T17:00:00.000Z");
  assert.equal(intervalo.fim.toISOString(), "2026-07-16T00:00:00.000Z");
});
test("cron atrasado conserva o instante programado", () => {
  const intervalo = intervaloDoTurno({ ano: 2026, mes: 1, dia: 15 }, "09:00", "17:00", "Europe/Lisbon");
  assert.ok(new Date("2026-01-15T09:05:00.000Z") >= intervalo.inicio);
  assert.equal(intervalo.inicio.toISOString(), "2026-01-15T09:00:00.000Z");
});
