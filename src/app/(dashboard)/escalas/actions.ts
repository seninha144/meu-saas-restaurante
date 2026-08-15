"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { horasEfetivasDoTurno } from "@/lib/horas";
import { createClient } from "@/lib/supabase/server";
import { PERIODOS, type Periodo } from "@/types/dominio";

const SEXTA = 4;
const SABADO = 5;
const DOMINGO = 6;
const MULTIPLICADOR_COBERTURA_EVENTO = 1.5;

export interface GerarEscalaState {
  erro?: string;
  turnosGerados?: number;
  turnosSubstituidos?: number;
  vagasSemCandidato?: number;
  diasProtegidos?: number;
  horasNaoAlocadas?: number;
  funcionariosComMetaIncompleta?: number;
}

interface PerfilFuncionario {
  id: string;
  zonaId: string | null;
  cargaHorariaSemanalMax: number;
  pausaAlmocoMinutos: number;
  diasTrabalhoAlvo: number;
}

interface HorarioDia {
  fechado: boolean;
  abertura: string;
  fechamento: string;
}

interface TurnoNovo {
  restaurante_id: string;
  escala_id: string;
  funcionario_id: string;
  zona_id: string | null;
  dia_semana: number;
  periodo: Periodo;
  hora_inicio: string;
  hora_fim: string;
  fora_preferencia: boolean;
  status: "agendado";
}

function paraMinutos(hora: string): number {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function paraHora(minutos: number): string {
  const normalizado = Math.round(minutos);
  return `${String(Math.floor(normalizado / 60)).padStart(2, "0")}:${String(normalizado % 60).padStart(2, "0")}`;
}

function paraISODateUTC(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(data.getUTCDate()).padStart(2, "0")}`;
}

function inicioDosPeriodos(abertura: string, fechamento: string): Record<Periodo, number> {
  const inicio = paraMinutos(abertura);
  const fim = paraMinutos(fechamento);
  const bloco = Math.max(fim - inicio, PERIODOS.length * 30) / PERIODOS.length;
  return PERIODOS.reduce((resultado, periodo, indice) => {
    resultado[periodo] = inicio + bloco * indice;
    return resultado;
  }, {} as Record<Periodo, number>);
}

function arredondar(horas: number): number {
  return Math.round(horas * 100) / 100;
}

export async function gerarEscalaAutomatica(
  escalaId: string,
  modoAltaDemanda = false,
  substituirTurnosExistentes = false
): Promise<GerarEscalaState> {
  const gerente = await requireGerente();
  const supabase = await createClient();

  const [{ data: restaurante }, { data: escala }] = await Promise.all([
    supabase
      .from("restaurantes")
      .select("usa_zonas, permite_ia, dias_funcionamento, cobertura_fds_prioritaria")
      .eq("id", gerente.restauranteId)
      .single(),
    supabase
      .from("escalas")
      .select("id, semana_inicio")
      .eq("id", escalaId)
      .eq("restaurante_id", gerente.restauranteId)
      .maybeSingle(),
  ]);

  if (!escala) return { erro: "Escala não encontrada para este restaurante." };
  if (restaurante && !restaurante.permite_ia) {
    return { erro: "Seu plano atual não inclui a geração automática de escala. Faça upgrade pra liberar." };
  }

  const { data: turnosExistentes, error: erroTurnosExistentes } = await supabase
    .from("turnos")
    .select("id, funcionario_id, zona_id, dia_semana, periodo, hora_inicio, hora_fim")
    .eq("escala_id", escalaId)
    .eq("restaurante_id", gerente.restauranteId);
  if (erroTurnosExistentes) return { erro: `Falha ao consultar a escala: ${erroTurnosExistentes.message}` };

  const turnosSubstituidos = substituirTurnosExistentes ? (turnosExistentes?.length ?? 0) : 0;
  if (substituirTurnosExistentes && turnosSubstituidos > 0) {
    const { error } = await supabase
      .from("turnos")
      .delete()
      .eq("escala_id", escalaId)
      .eq("restaurante_id", gerente.restauranteId);
    if (error) return { erro: `Falha ao limpar os turnos existentes: ${error.message}` };
  }

  const [{ data: zonasRaw }, { data: funcionariosRaw }, { data: disponibilidadesRaw }, { data: horariosRaw }] = await Promise.all([
    supabase.from("zonas").select("id, capacidade_minima").eq("restaurante_id", gerente.restauranteId).eq("ativo", true),
    supabase
      .from("funcionarios")
      .select("id, zona_id, carga_horaria_semanal_max, folgas_obrigatorias_semana, pausa_almoco_minutos")
      .eq("restaurante_id", gerente.restauranteId)
      .eq("ativo", true),
    supabase.from("disponibilidades").select("funcionario_id, dia_semana, disponivel, periodo").eq("restaurante_id", gerente.restauranteId),
    supabase.from("horarios_funcionamento").select("dia_semana, fechado, hora_abertura, hora_fechamento").eq("restaurante_id", gerente.restauranteId),
  ]);

  const usaZonas = restaurante?.usa_zonas ?? true;
  const diasFuncionamento: number[] = restaurante?.dias_funcionamento ?? [0, 1, 2, 3, 4, 5, 6];
  const zonas = zonasRaw ?? [];
  const disponibilidades = disponibilidadesRaw ?? [];
  const horariosPorDia = new Map<number, HorarioDia>();
  for (const horario of horariosRaw ?? []) {
    horariosPorDia.set(horario.dia_semana, {
      fechado: horario.fechado,
      abertura: horario.hora_abertura?.slice(0, 5) ?? "09:00",
      fechamento: horario.hora_fechamento?.slice(0, 5) ?? "23:00",
    });
  }

  const funcionarios: PerfilFuncionario[] = (funcionariosRaw ?? []).map((funcionario) => ({
    id: funcionario.id,
    zonaId: funcionario.zona_id,
    cargaHorariaSemanalMax: Number(funcionario.carga_horaria_semanal_max),
    pausaAlmocoMinutos: funcionario.pausa_almoco_minutos ?? 30,
    diasTrabalhoAlvo: Math.max(0, Math.min(7 - Number(funcionario.folgas_obrigatorias_semana), diasFuncionamento.length)),
  }));

  const semanaInicio = new Date(`${escala.semana_inicio}T00:00:00Z`);
  const hojeISO = paraISODateUTC(new Date());
  const dataDoDia = (dia: number) => {
    const data = new Date(semanaInicio);
    data.setUTCDate(data.getUTCDate() + dia);
    return paraISODateUTC(data);
  };
  const diasPassados = new Set(Array.from({ length: 7 }, (_, dia) => dia).filter((dia) => dataDoDia(dia) < hojeISO));
  const diasParaProcessar = diasFuncionamento
    .filter((dia) => !diasPassados.has(dia) && !(horariosPorDia.get(dia)?.fechado ?? false))
    .sort((a, b) => {
      if (!restaurante?.cobertura_fds_prioritaria) return a - b;
      const peso = (dia: number) => (dia === SEXTA || dia === SABADO || dia === DOMINGO ? 0 : 1);
      return peso(a) - peso(b) || a - b;
    });

  const turnosBase = substituirTurnosExistentes ? [] : turnosExistentes ?? [];
  const diasOcupados = new Map(funcionarios.map((funcionario) => [funcionario.id, new Set<number>()]));
  const horasRestantes = new Map(funcionarios.map((funcionario) => [funcionario.id, funcionario.cargaHorariaSemanalMax]));
  const coberturaExistente = new Map<string, number>();
  for (const turno of turnosBase) {
    diasOcupados.get(turno.funcionario_id)?.add(turno.dia_semana);
    const funcionario = funcionarios.find((item) => item.id === turno.funcionario_id);
    if (funcionario) {
      const horas = horasEfetivasDoTurno(turno.hora_inicio?.slice(0, 5) ?? null, turno.hora_fim?.slice(0, 5), funcionario.pausaAlmocoMinutos);
      horasRestantes.set(funcionario.id, Math.max(0, (horasRestantes.get(funcionario.id) ?? 0) - horas));
    }
    const chave = `${turno.zona_id ?? "sem-zona"}:${turno.dia_semana}:${turno.periodo}`;
    coberturaExistente.set(chave, (coberturaExistente.get(chave) ?? 0) + 1);
  }

  const indisponivelNoDia = (funcionarioId: string, dia: number) =>
    disponibilidades.some((item) => item.funcionario_id === funcionarioId && item.dia_semana === dia && item.disponivel === false && item.periodo === null);
  const periodosPreferidos = (funcionarioId: string, dia: number): Periodo[] =>
    disponibilidades
      .filter((item) => item.funcionario_id === funcionarioId && item.dia_semana === dia && item.disponivel && item.periodo)
      .map((item) => item.periodo as Periodo);

  const diasElegiveis = (funcionario: PerfilFuncionario) =>
    diasParaProcessar.filter((dia) => !diasOcupados.get(funcionario.id)?.has(dia) && !indisponivelNoDia(funcionario.id, dia));

  const horarioDoTurno = (funcionario: PerfilFuncionario, dia: number, periodo: Periodo) => {
    const horarioDia = horariosPorDia.get(dia);
    if (!horarioDia) return null;
    const abertura = paraMinutos(horarioDia.abertura);
    const fechamento = paraMinutos(horarioDia.fechamento);
    const inicioPeriodo = inicioDosPeriodos(horarioDia.abertura, horarioDia.fechamento)[periodo];
    const horasMaximas = Math.max(0, (fechamento - abertura - funcionario.pausaAlmocoMinutos) / 60);
    return horasMaximas > 0 ? { abertura, fechamento, inicioPeriodo, horasMaximas } : null;
  };

  const podeTrabalhar = (funcionario: PerfilFuncionario, zonaId: string | null, dia: number, periodo: Periodo, respeitarPreferencia: boolean) => {
    if (usaZonas && funcionario.zonaId !== zonaId) return false;
    if (diasOcupados.get(funcionario.id)?.has(dia) || indisponivelNoDia(funcionario.id, dia)) return false;
    if ((diasOcupados.get(funcionario.id)?.size ?? 0) >= funcionario.diasTrabalhoAlvo) return false;
    const preferencias = periodosPreferidos(funcionario.id, dia);
    if (respeitarPreferencia && preferencias.length > 0 && !preferencias.includes(periodo)) return false;
    return !!horarioDoTurno(funcionario, dia, periodo);
  };

  const horasPlanejadas = (funcionario: PerfilFuncionario, dia: number, periodo: Periodo) => {
    const horario = horarioDoTurno(funcionario, dia, periodo);
    if (!horario) return 0;
    const restantes = horasRestantes.get(funcionario.id) ?? 0;
    const diasRestantes = Math.min(
      diasElegiveis(funcionario).length,
      Math.max(0, funcionario.diasTrabalhoAlvo - (diasOcupados.get(funcionario.id)?.size ?? 0))
    );
    if (restantes <= 0 || diasRestantes <= 0) return 0;
    return Math.min(restantes, restantes / diasRestantes, horario.horasMaximas);
  };

  const novosTurnos: TurnoNovo[] = [];
  const alocar = (funcionario: PerfilFuncionario, zonaId: string | null, dia: number, periodo: Periodo, foraPreferencia: boolean) => {
    const horario = horarioDoTurno(funcionario, dia, periodo);
    const horas = horasPlanejadas(funcionario, dia, periodo);
    if (!horario || horas <= 0) return false;
    const inicio = Math.max(
      horario.abertura,
      Math.min(horario.inicioPeriodo, horario.fechamento - (horas * 60 + funcionario.pausaAlmocoMinutos))
    );
    novosTurnos.push({
      restaurante_id: gerente.restauranteId,
      escala_id: escalaId,
      funcionario_id: funcionario.id,
      zona_id: zonaId,
      dia_semana: dia,
      periodo,
      hora_inicio: paraHora(inicio),
      hora_fim: paraHora(inicio + horas * 60 + funcionario.pausaAlmocoMinutos),
      fora_preferencia: foraPreferencia,
      status: "agendado",
    });
    diasOcupados.get(funcionario.id)?.add(dia);
    horasRestantes.set(funcionario.id, Math.max(0, (horasRestantes.get(funcionario.id) ?? 0) - horas));
    return true;
  };

  const escolherFuncionario = (zonaId: string | null, dia: number, periodo: Periodo, respeitarPreferencia: boolean) =>
    funcionarios
      .filter((funcionario) => podeTrabalhar(funcionario, zonaId, dia, periodo, respeitarPreferencia) && (horasRestantes.get(funcionario.id) ?? 0) > 0)
      .sort((a, b) => (horasRestantes.get(b.id) ?? 0) - (horasRestantes.get(a.id) ?? 0))[0];

  let vagasSemCandidato = 0;
  const zonasDaEscala: ({ id: string; capacidade_minima: number } | null)[] = usaZonas ? zonas : [null];
  for (const dia of diasParaProcessar) {
    for (const zona of zonasDaEscala) {
      const zonaId = zona?.id ?? null;
      const capacidadeBase = zona ? Math.max(zona.capacidade_minima, 1) : 1;
      const capacidadeAlvo = modoAltaDemanda ? Math.ceil(capacidadeBase * MULTIPLICADOR_COBERTURA_EVENTO) : capacidadeBase;
      for (const periodo of PERIODOS) {
        const chave = `${zonaId ?? "sem-zona"}:${dia}:${periodo}`;
        let faltam = Math.max(0, capacidadeAlvo - (coberturaExistente.get(chave) ?? 0));
        for (const respeitarPreferencia of [true, false]) {
          while (faltam > 0) {
            const candidato = escolherFuncionario(zonaId, dia, periodo, respeitarPreferencia);
            if (!candidato || !alocar(candidato, zonaId, dia, periodo, !respeitarPreferencia)) break;
            faltam--;
          }
          if (faltam === 0) break;
        }
        vagasSemCandidato += faltam;
      }
    }

    // Depois de cobrir o mínimo, completa a meta contratual de quem ainda está disponível no dia.
    for (const funcionario of [...funcionarios].sort((a, b) => (horasRestantes.get(b.id) ?? 0) - (horasRestantes.get(a.id) ?? 0))) {
      if (diasOcupados.get(funcionario.id)?.has(dia) || (horasRestantes.get(funcionario.id) ?? 0) <= 0) continue;
      const zonaId = usaZonas ? funcionario.zonaId : null;
      if (usaZonas && !zonaId) continue;
      const preferencias = periodosPreferidos(funcionario.id, dia);
      const periodosOrdenados = [...PERIODOS].sort((a, b) => (horarioDoTurno(funcionario, dia, b)?.horasMaximas ?? 0) - (horarioDoTurno(funcionario, dia, a)?.horasMaximas ?? 0));
      const periodo = (preferencias.length > 0 ? periodosOrdenados.filter((item) => preferencias.includes(item)) : periodosOrdenados)[0] ?? periodosOrdenados[0];
      if (periodo && podeTrabalhar(funcionario, zonaId, dia, periodo, false)) {
        alocar(funcionario, zonaId, dia, periodo, preferencias.length > 0 && !preferencias.includes(periodo));
      }
    }
  }

  if (novosTurnos.length > 0) {
    const { error } = await supabase.from("turnos").insert(novosTurnos);
    if (error) return { erro: `Falha ao gravar a escala: ${error.message}` };
  }

  const horasNaoAlocadas = arredondar(Array.from(horasRestantes.values()).reduce((total, horas) => total + horas, 0));
  const funcionariosComMetaIncompleta = Array.from(horasRestantes.values()).filter((horas) => horas > 0.01).length;
  revalidatePath("/escalas");
  return { turnosGerados: novosTurnos.length, turnosSubstituidos, vagasSemCandidato, diasProtegidos: diasPassados.size, horasNaoAlocadas, funcionariosComMetaIncompleta };
}
