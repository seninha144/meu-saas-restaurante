"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Periodo } from "@/types/dominio";

const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];
const HORAS_POR_TURNO = 8;

export interface GerarEscalaState {
  erro?: string;
  turnosGerados?: number;
  vagasSemCandidato?: number;
}

export async function gerarEscalaAutomatica(escalaId: string): Promise<GerarEscalaState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const { data: restauranteConfig } = await supabase
    .from("restaurantes")
    .select("usa_zonas, permite_ia")
    .eq("id", gerente.restauranteId)
    .single();

  if (restauranteConfig && !restauranteConfig.permite_ia) {
    return { erro: "Seu plano atual não inclui a geração automática de escala. Faça upgrade pra liberar." };
  }

  const [{ data: zonasRaw }, { data: funcionariosRaw }, { data: disponibilidadesRaw }, { data: turnosExistentes }] =
    await Promise.all([
      supabase.from("zonas").select("id, capacidade_minima").eq("restaurante_id", gerente.restauranteId).eq("ativo", true),
      supabase
        .from("funcionarios")
        .select("id, zona_id, carga_horaria_semanal_max")
        .eq("restaurante_id", gerente.restauranteId)
        .eq("ativo", true),
      supabase.from("disponibilidades").select("funcionario_id, dia_semana, disponivel, periodo").eq("restaurante_id", gerente.restauranteId),
      supabase.from("turnos").select("id, funcionario_id, zona_id, dia_semana, periodo").eq("escala_id", escalaId),
    ]);

  const usaZonas = restauranteConfig?.usa_zonas ?? true;
  const zonas = zonasRaw ?? [];
  const funcionarios = funcionariosRaw ?? [];
  const disponibilidades = disponibilidadesRaw ?? [];
  const turnos = turnosExistentes ?? [];

  const combinacoesZona: (string | null)[] = usaZonas ? zonas.map((z) => z.id) : [null];

  const horasAlocadas = new Map<string, number>();
  const diasOcupados = new Map<string, Set<number>>();
  funcionarios.forEach((f) => {
    horasAlocadas.set(f.id, 0);
    diasOcupados.set(f.id, new Set());
  });
  turnos.forEach((t) => {
    horasAlocadas.set(t.funcionario_id, (horasAlocadas.get(t.funcionario_id) ?? 0) + HORAS_POR_TURNO);
    diasOcupados.get(t.funcionario_id)?.add(t.dia_semana);
  });

  function elegivel(funcionarioId: string, zonaId: string | null, dia: number, periodo: Periodo): boolean {
    const f = funcionarios.find((x) => x.id === funcionarioId)!;

    if (usaZonas && f.zona_id !== zonaId) return false;
    if (diasOcupados.get(funcionarioId)?.has(dia)) return false;
    if ((horasAlocadas.get(funcionarioId) ?? 0) + HORAS_POR_TURNO > Number(f.carga_horaria_semanal_max)) return false;

    const dispsDoDia = disponibilidades.filter((d) => d.funcionario_id === funcionarioId && d.dia_semana === dia);
    if (dispsDoDia.some((d) => d.disponivel === false && d.periodo === null)) return false;
    const comPreferencia = dispsDoDia.filter((d) => d.periodo !== null);
    if (comPreferencia.length > 0 && !comPreferencia.some((d) => d.periodo === periodo)) return false;

    return true;
  }

  const novosTurnos: {
    restaurante_id: string;
    escala_id: string;
    funcionario_id: string;
    zona_id: string | null;
    dia_semana: number;
    periodo: Periodo;
    status: "agendado";
  }[] = [];

  let vagasSemCandidato = 0;

  for (const zonaId of combinacoesZona) {
    for (let dia = 0; dia < 7; dia++) {
      for (const periodo of PERIODOS) {
        const jaAlocado = turnos.some((t) => t.zona_id === zonaId && t.dia_semana === dia && t.periodo === periodo);
        if (jaAlocado) continue;

        const candidato = funcionarios
          .filter((f) => elegivel(f.id, zonaId, dia, periodo))
          .sort((a, b) => (horasAlocadas.get(a.id) ?? 0) - (horasAlocadas.get(b.id) ?? 0))[0];

        if (!candidato) {
          vagasSemCandidato++;
          continue;
        }

        novosTurnos.push({
          restaurante_id: gerente.restauranteId,
          escala_id: escalaId,
          funcionario_id: candidato.id,
          zona_id: zonaId,
          dia_semana: dia,
          periodo,
          status: "agendado",
        });

        horasAlocadas.set(candidato.id, (horasAlocadas.get(candidato.id) ?? 0) + HORAS_POR_TURNO);
        diasOcupados.get(candidato.id)?.add(dia);
      }
    }
  }

  if (novosTurnos.length === 0) {
    return { turnosGerados: 0, vagasSemCandidato };
  }

  const { error } = await supabase.from("turnos").insert(novosTurnos);
  if (error) {
    console.error("[gerarEscalaAutomatica] falha ao inserir turnos:", error);
    return { erro: `Falha ao gravar a escala: ${error.message}` };
  }

  revalidatePath("/escalas");
  return { turnosGerados: novosTurnos.length, vagasSemCandidato };
}