"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export interface FuncionarioFormState {
  erro?: string;
  sucesso?: boolean;
}

function lerDisponibilidade(formData: FormData) {
  // o formulário envia checkboxes nomeados "disp-{dia}-{periodo}"
  const linhas: { diaSemana: number; disponivel: boolean; periodo: string | null }[] = [];
  for (let dia = 0; dia < 7; dia++) {
    const indisponivel = formData.get(`indisponivel-${dia}`) === "on";
    if (indisponivel) {
      linhas.push({ diaSemana: dia, disponivel: false, periodo: null });
      continue;
    }
    for (const periodo of ["Manhã", "Tarde", "Noite", "Fechamento"]) {
      if (formData.get(`disp-${dia}-${periodo}`) === "on") {
        linhas.push({ diaSemana: dia, disponivel: true, periodo });
      }
    }
  }
  return linhas;
}

export async function salvarFuncionario(
  _prevState: FuncionarioFormState,
  formData: FormData
): Promise<FuncionarioFormState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const cargo = String(formData.get("cargo") ?? "").trim();
  const zonaId = String(formData.get("zonaId") ?? "") || null;
  const idadeRaw = String(formData.get("idade") ?? "");
  const genero = String(formData.get("genero") ?? "") || null;
  const cargaHorariaSemanalMax = Number(formData.get("cargaHorariaSemanalMax") ?? 44);
  const folgasObrigatorias = Number(formData.get("folgasObrigatorias") ?? 2);

  if (!nome || !cargo) {
    return { erro: "Nome e cargo são obrigatórios." };
  }

  const payload = {
    restaurante_id: gerente.restauranteId,
    nome,
    cargo,
    zona_id: zonaId,
    idade: idadeRaw ? Number(idadeRaw) : null,
    genero,
    carga_horaria_semanal_max: cargaHorariaSemanalMax,
    folgas_obrigatorias_semana: folgasObrigatorias,
    // campos obrigatórios do schema com defaults razoáveis — ajuste no
    // formulário se seu MVP já cobrir contrato/pagamento neste modal
    tipo_contrato: "full_time" as const,
    modalidade_pagamento: "mes" as const,
  };

  const { data: funcionario, error } = id
    ? await supabase.from("funcionarios").update(payload).eq("id", id).select("id").single()
    : await supabase.from("funcionarios").insert(payload).select("id").single();

  if (error || !funcionario) {
    return { erro: `Falha ao salvar funcionário: ${error?.message}` };
  }

  // disponibilidade: substitui tudo (simples e correto para um form que reenvia o estado completo)
  await supabase.from("disponibilidades").delete().eq("funcionario_id", funcionario.id);
  const linhas = lerDisponibilidade(formData);
  if (linhas.length > 0) {
    await supabase.from("disponibilidades").insert(
      linhas.map((l) => ({
        restaurante_id: gerente.restauranteId,
        funcionario_id: funcionario.id,
        dia_semana: l.diaSemana,
        disponivel: l.disponivel,
        periodo: l.periodo,
      }))
    );
  }

  revalidatePath("/escalas");
  return { sucesso: true };
}

export async function desativarFuncionario(funcionarioId: string): Promise<void> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  await supabase
    .from("funcionarios")
    .update({ ativo: false })
    .eq("id", funcionarioId)
    .eq("restaurante_id", gerente.restauranteId); // defesa extra além do RLS

  revalidatePath("/escalas");
}