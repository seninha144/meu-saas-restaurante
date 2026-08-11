"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Periodo } from "@/types/dominio";

const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];
const HORAS_POR_TURNO = 8;
const SABADO = 5;
const DOMINGO = 6;

export interface GerarEscalaState {
  erro?: string;
  turnosGerados?: number;
  vagasSemCandidato?: number;
}

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function paraHora(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = Math.round(minutos % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Divide a janela de funcionamento do dia em 4 blocos contíguos, um por período. */
function calcularJanelasPeriodo(abertura: string, fechamento: string): Record<Periodo, { inicio: string; fim: string }> {
  const inicioMin = paraMinutos(abertura);
  const fimMin = paraMinutos(fechamento);
  const duracaoTotal = Math.max(fimMin - inicioMin, PERIODOS.length * 30); // nunca deixa blocos com menos de 30min
  const duracaoBloco = duracaoTotal / PERIODOS.length;

  const janelas = {} as Record<Periodo, { inicio: string; fim: string }>;
  PERIODOS.forEach((periodo, i) => {
    const inicio = inicioMin + i * duracaoBloco;
    const fim = i === PERIODOS.length - 1 ? fimMin : inicioMin + (i + 1) * duracaoBloco;
    janelas[periodo] = { inicio: paraHora(inicio), fim: paraHora(fim) };
  });
  return janelas;
}

export async function gerarEscalaAutomatica(escalaId: string): Promise<GerarEscalaState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const { data: restauranteConfig } = await supabase
    .from("restaurantes")
    .select("usa_zonas, permite_ia, dias_funcionamento, cobertura_fds_prioritaria")
    .eq("id", gerente.restauranteId)
    .single();

  if (restauranteConfig && !restauranteConfig.permite_ia) {
    return { erro: "Seu plano atual não inclui a geração automática de escala. Faça upgrade pra liberar." };
  }

  const [{ data: zonasRaw }, { data: funcionariosRaw }, { data: disponibilidadesRaw }, { data: turnosExistentes }, { data: horariosRaw }] =
    await Promise.all([
      supabase.from("zonas").select("id, capacidade_minima").eq("restaurante_id", gerente.restauranteId).eq("ativo", true),
      supabase
        .from("funcionarios")
        .select("id, zona_id, carga_horaria_semanal_max")
        .eq("restaurante_id", gerente.restauranteId)
        .eq("ativo", true),
      supabase.from("disponibilidades").select("funcionario_id, dia_semana, disponivel, periodo").eq("restaurante_id", gerente.restauranteId),
      supabase.from("turnos").select("id, funcionario_id, zona_id, dia_semana, periodo").eq("escala_id", escalaId),
      supabase.from("horarios_funcionamento").select("dia_semana, fechado, hora_abertura, hora_fechamento").eq("restaurante_id", gerente.restauranteId),
    ]);

  const usaZonas = restauranteConfig?.usa_zonas ?? true;
  const diasFuncionamento: number[] = restauranteConfig?.dias_funcionamento ?? [0, 1, 2, 3, 4, 5, 6];
  const coberturaFdsPrioritaria = restauranteConfig?.cobertura_fds_prioritaria ?? true;

  const zonas = zonasRaw ?? [];
  const funcionarios = funcionariosRaw ?? [];
  const disponibilidades = disponibilidadesRaw ?? [];
  const turnos = turnosExistentes ?? [];
  const horariosPorDia = new Map((horariosRaw ?? []).map((h) => [h.dia_semana, h]));

  const combinacoesZona: (string | null)[] = usaZonas ? zonas.map((z) => z.id) : [null];

  const diasParaProcessar = diasFuncionamento.slice().sort((a, b) => {
    if (!coberturaFdsPrioritaria) return a - b;
    const aFds = a === SABADO || a === DOMINGO ? 0 : 1;
    const bFds = b === SABADO || b === DOMINGO ? 0 : 1;
    return aFds - bFds || a - b;
  });

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
    hora_inicio: string;
    hora_fim: string;
    status: "agendado";
  }[] = [];

  let vagasSemCandidato = 0;

  for (const dia of diasParaProcessar) {
    const horarioDia = horariosPorDia.get(dia);
    if (horarioDia?.fechado) continue;

    const abertura = horarioDia?.hora_abertura?.slice(0, 5) ?? "09:00";
    const fechamento = horarioDia?.hora_fechamento?.slice(0, 5) ?? "23:00";
    const janelas = calcularJanelasPeriodo(abertura, fechamento);

    for (const zonaId of combinacoesZona) {
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
          hora_inicio: janelas[periodo].inicio,
          hora_fim: janelas[periodo].fim,
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