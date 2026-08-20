import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lerPerfilOperacionalFormData,
  type PerfilOperacionalPayload,
} from "../src/lib/perfil-operacional/perfil-operacional.ts";
import { salvarPerfilOperacional } from "../src/lib/perfil-operacional/persistencia.ts";
import type { Database } from "../src/types/database.types.ts";

function formularioBase() {
  const formData = new FormData();
  formData.set("aberto-0", "on");
  formData.set("abertura-0", "18:00");
  formData.set("fechamento-0", "01:00");
  formData.set("coberturaFdsPrioritaria", "on");
  formData.set("permiteHorarioRepartido", "true");
  formData.set("permiteHorasExtras", "true");
  formData.set("limiteHorasExtrasSemanais", "2");
  formData.set(
    "movimentosOperacionais",
    JSON.stringify([{ dia_semana: 0, periodo: "Fechamento", nivel: "alto" }])
  );
  formData.set(
    "necessidadesEquipe",
    JSON.stringify([
      {
        dia_semana: 0,
        periodo: "Fechamento",
        zona_id: "zona-1",
        funcao: "Cozinheiro",
        minimo: 1,
        ideal: 2,
        maximo: 3,
      },
    ])
  );
  return formData;
}

test("lê o perfil preenchido e preserva fechamento após meia-noite", () => {
  const resultado = lerPerfilOperacionalFormData(formularioBase());
  if (!resultado.dados) assert.fail(resultado.erro);
  assert.equal(resultado.dados.horarios[0].hora_abertura, "18:00");
  assert.equal(resultado.dados.horarios[0].hora_fechamento, "01:00");
  assert.equal(resultado.dados.movimentos[0].nivel, "alto");
  assert.equal(resultado.dados.necessidades[0].zona_id, "zona-1");
  assert.equal(resultado.dados.coberturaFdsPrioritaria, true);
  assert.equal(resultado.dados.permiteHorarioRepartido, true);
  assert.equal(resultado.dados.permiteHorasExtras, true);
  assert.equal(resultado.dados.limiteHorasExtrasSemanais, 2);
});

test("normaliza horas extras desativadas para limite zero", () => {
  const formData = formularioBase();
  formData.set("permiteHorasExtras", "false");
  formData.set("limiteHorasExtrasSemanais", "2");
  const resultado = lerPerfilOperacionalFormData(formData);
  if (!resultado.dados) assert.fail(resultado.erro);
  assert.equal(resultado.dados.permiteHorasExtras, false);
  assert.equal(resultado.dados.limiteHorasExtrasSemanais, 0);
});

for (const limite of ["-1", "0", "1.5", "3"]) {
  test(`rejeita limite semanal inválido: ${limite}`, () => {
    const formData = formularioBase();
    formData.set("limiteHorasExtrasSemanais", limite);
    const resultado = lerPerfilOperacionalFormData(formData);
    assert.match(resultado.erro ?? "", /1 ou 2 horas/);
  });
}

test("rejeita necessidade quando mínimo, ideal e máximo estão fora de ordem", () => {
  const formData = formularioBase();
  formData.set(
    "necessidadesEquipe",
    JSON.stringify([
      {
        dia_semana: 0,
        periodo: "Fechamento",
        zona_id: null,
        funcao: null,
        minimo: 3,
        ideal: 2,
        maximo: 1,
      },
    ])
  );

  const resultado = lerPerfilOperacionalFormData(formData);
  if (!resultado.erro) assert.fail("A necessidade inválida foi aceita.");
  assert.match(resultado.erro, /mínimo, ideal e máximo/);
});

test("persistência de Configurações não altera onboarding nem escalas existentes", async () => {
  const operacoes: Array<{ tabela: string; operacao: string; payload?: unknown }> = [];
  const cliente = {
    from(tabela: string) {
      return {
        update(payload: unknown) {
          operacoes.push({ tabela, operacao: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
        upsert: async (payload: unknown) => {
          operacoes.push({ tabela, operacao: "upsert", payload });
          return { error: null };
        },
        delete() {
          operacoes.push({ tabela, operacao: "delete" });
          return { eq: async () => ({ error: null }) };
        },
        insert: async (payload: unknown) => {
          operacoes.push({ tabela, operacao: "insert", payload });
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  const resultado = lerPerfilOperacionalFormData(formularioBase());
  if (!resultado.dados) assert.fail(resultado.erro);
  const erro = await salvarPerfilOperacional(cliente, "restaurante-1", resultado.dados as PerfilOperacionalPayload, false);

  assert.equal(erro, null);
  assert.deepEqual(
    new Set(operacoes.map(({ tabela }) => tabela)),
    new Set(["restaurantes", "horarios_funcionamento", "movimento_operacional", "necessidades_equipe"])
  );
  const restaurante = operacoes.find(({ tabela, operacao }) => tabela === "restaurantes" && operacao === "update");
  assert.ok(restaurante);
  assert.equal("onboarding_concluido" in (restaurante.payload as Record<string, unknown>), false);
  assert.equal(
    (restaurante.payload as Record<string, unknown>).permite_horario_repartido,
    true
  );
  assert.equal((restaurante.payload as Record<string, unknown>).permite_horas_extras, true);
  assert.equal((restaurante.payload as Record<string, unknown>).limite_horas_extras_semanais, 2);
});
