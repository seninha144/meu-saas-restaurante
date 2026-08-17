import assert from "node:assert/strict";
import test from "node:test";
import {
  dividirIntervalo,
  formatarHoraDoDia,
  horasEfetivasDoTurno,
  intervaloEmMinutos,
} from "../src/lib/horas.ts";

test("mantém o horário normal 09:00 → 23:00", () => {
  assert.deepEqual(intervaloEmMinutos("09:00", "23:00"), { inicio: 540, fim: 1380 });
  assert.equal(horasEfetivasDoTurno("09:00", "23:00"), 14);
});

test("interpreta 18:00 → 01:00 como sete horas", () => {
  assert.deepEqual(intervaloEmMinutos("18:00", "01:00"), { inicio: 1080, fim: 1500 });
  assert.equal(horasEfetivasDoTurno("18:00", "01:00"), 7);
});

test("interpreta 17:00 → 02:00 como nove horas", () => {
  assert.equal(horasEfetivasDoTurno("17:00", "02:00"), 9);
});

test("salva e exibe o fim acima de 24h como 01:00", () => {
  assert.equal(formatarHoraDoDia(25 * 60), "01:00");
});

test("distribui os períodos em ordem ao atravessar meia-noite", () => {
  assert.deepEqual(dividirIntervalo("18:00", "01:00", 4), [1080, 1185, 1290, 1395]);
});

test("a abertura normal do dia seguinte permanece independente", () => {
  assert.deepEqual(intervaloEmMinutos("09:00", "23:00"), { inicio: 540, fim: 1380 });
});
