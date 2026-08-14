"use server";

import { revalidatePath } from "next/cache";
import { requireGerente } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Periodo } from "@/types/dominio";

const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];
const SEXTA = 4;
const SABADO = 5;
const DOMINGO = 6;
const LIMITE_HORA_EXTRA_EVENTO = 8;
const MULTIPLICADOR_COBERTURA_EVENTO = 1.5;

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
function calcularJanelasPeriodo(abertura: string, fechamento: string): Record<Periodo, number> {
  // agora só precisamos do INÍCIO de cada período — o fim de cada
  // turno é calculado por pessoa, a partir da jornada dela, não mais
  // um bloco fixo de 1/4 do dia.
  const inicioMin = paraMinutos(abertura);
  const fimMin = paraMinutos(fechamento);
  const duracaoTotal = Math.max(fimMin - inicioMin, PERIODOS.length * 30);
  const duracaoBloco = duracaoTotal / PERIODOS.length;
  const janelas = {} as Record<Periodo, number>;
  PERIODOS.forEach((periodo, i) => {
    janelas[periodo] = inicioMin + i * duracaoBloco;
  });
  return janelas;
}
/** Arredonda pra múltiplo de 15min — evita jornada tipo "6h37min" numa escala real. */
function arredondar15min(horas: number): number {
  return Math.round(horas * 4) / 4;
}

interface PerfilFuncionario {
  id: string;
  zonaId: string | null;
  cargaHorariaSemanalMax: number;
  folgasObrigatorias: number;
  pausaAlmocoMinutos: number;
  diasTrabalhoAlvo: number; // 7 − folgas, já contando que dia fechado do restaurante "consome" folga automaticamente
  jornadaDiariaHoras: number; // carga ÷ diasTrabalhoAlvo, arredondado
}

export async function gerarEscalaAutomatica(escalaId: string, modoAltaDemanda = false): Promise<GerarEscalaState> {
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
        .select("id, zona_id, carga_horaria_semanal_max, folgas_obrigatorias_semana, pausa_almoco_minutos")
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
  const disponibilidades = disponibilidadesRaw ?? [];
  const turnosPreExistentes = turnosExistentes ?? [];
  const horariosPorDia = new Map((horariosRaw ?? []).map((h) => [h.dia_semana, h]));

  // ---- Requisito 1: matemática de folgas — dia fechado já conta como
  // folga automaticamente. diasTrabalhoAlvo = 7 − folgasObrigatorias
  // (não diasFuncionamento.length − folgas) é justamente o que garante
  // isso: se o restaurante fecha 1 dia e a pessoa tem 2 folgas
  // contratuais, sobra só 1 folga pra distribuir nos dias abertos.
  const funcionarios: PerfilFuncionario[] = (funcionariosRaw ?? []).map((f) => {
    const diasTrabalhoAlvo = Math.max(
      Math.min(7 - f.folgas_obrigatorias_semana, diasFuncionamento.length),
      0
    );
    const jornadaDiariaHoras =
      diasTrabalhoAlvo > 0 ? arredondar15min(Number(f.carga_horaria_semanal_max) / diasTrabalhoAlvo) : 0;

    return {
      id: f.id,
      zonaId: f.zona_id,
      cargaHorariaSemanalMax: Number(f.carga_horaria_semanal_max),
      folgasObrigatorias: f.folgas_obrigatorias_semana,
      pausaAlmocoMinutos: f.pausa_almoco_minutos ?? 30,
      diasTrabalhoAlvo,
      jornadaDiariaHoras,
    };
  });

  const combinacoesZona: (string | null)[] = usaZonas ? zonas.map((z) => z.id) : [null];

  // ---- Requisito 2: Sexta/Sábado/Domingo processados ANTES do meio
  // da semana — como a escolha de candidato é gulosa por "dias ainda
  // faltando pra meta", processar o FDS primeiro garante que essas
  // vagas sejam preenchidas enquanto todo mundo ainda tem folga de
  // dias disponíveis, em vez de sobrar só quem já bateu a meta.
  const diasParaProcessar = diasFuncionamento.slice().sort((a, b) => {
    if (!coberturaFdsPrioritaria) return a - b;
    const pesoFds = (d: number) => (d === SEXTA || d === SABADO || d === DOMINGO ? 0 : 1);
    return pesoFds(a) - pesoFds(b) || a - b;
  });

  const diasOcupados = new Map<string, Set<number>>();
  funcionarios.forEach((f) => diasOcupados.set(f.id, new Set()));
  turnosPreExistentes.forEach((t) => diasOcupados.get(t.funcionario_id)?.add(t.dia_semana));

  const limiteExtraDias = modoAltaDemanda ? 1 : 0; // evento pode pedir 1 dia a mais que a meta contratual

  function elegivel(f: PerfilFuncionario, zonaId: string | null, dia: number, periodo: Periodo, respeitarPreferencia: boolean): boolean {
    if (usaZonas && f.zonaId !== zonaId) return false;
    const ocupados = diasOcupados.get(f.id)!;
    if (ocupados.has(dia)) return false;
    if (ocupados.size >= f.diasTrabalhoAlvo + limiteExtraDias) return false; // hard: meta de dias (± evento)

    const dispsDoDia = disponibilidades.filter((d) => d.funcionario_id === f.id && d.dia_semana === dia);
    if (dispsDoDia.some((d) => d.disponivel === false && d.periodo === null)) return false; // indisponibilidade é sempre hard

    if (respeitarPreferencia) {
      const comPreferencia = dispsDoDia.filter((d) => d.periodo !== null);
      if (comPreferencia.length > 0 && !comPreferencia.some((d) => d.periodo === periodo)) return false;
    }

    return true;
  }

  /** Quem ainda tem mais dias faltando pra própria meta entra primeiro. */
  function diasFaltando(f: PerfilFuncionario): number {
    return f.diasTrabalhoAlvo - (diasOcupados.get(f.id)?.size ?? 0);
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
    fora_preferencia: boolean;
    status: "agendado";
  }[] = [];

  let vagasSemCandidato = 0;

  for (const dia of diasParaProcessar) {
    const horarioDia = horariosPorDia.get(dia);
    if (horarioDia?.fechado) continue;

    const abertura = horarioDia?.hora_abertura?.slice(0, 5) ?? "09:00";
    const fechamento = horarioDia?.hora_fechamento?.slice(0, 5) ?? "23:00";
    const fechamentoMin = paraMinutos(fechamento);
    const inicioPorPeriodo = calcularJanelasPeriodo(abertura, fechamento);

    for (const zonaId of combinacoesZona) {
      const zona = zonaId ? zonas.find((z) => z.id === zonaId) : null;
      const capacidadeBase = zona ? Math.max(zona.capacidade_minima, 1) : 1;
      const capacidadeAlvo = modoAltaDemanda ? Math.ceil(capacidadeBase * MULTIPLICADOR_COBERTURA_EVENTO) : capacidadeBase;

      for (const periodo of PERIODOS) {
        const jaAlocados = turnosPreExistentes.filter(
          (t) => t.zona_id === zonaId && t.dia_semana === dia && t.periodo === periodo
        ).length;
        let vagasRestantes = Math.max(capacidadeAlvo - jaAlocados, 0);

        for (const respeitarPreferencia of [true, false]) {
          if (vagasRestantes === 0) break;

          while (vagasRestantes > 0) {
            const candidato = funcionarios
              .filter((f) => elegivel(f, zonaId, dia, periodo, respeitarPreferencia))
              .sort((a, b) => diasFaltando(b) - diasFaltando(a))[0];

            if (!candidato) break;

            // ---- Requisito 3: horário exato do restaurante + pausa
            // embutida — nunca passa do fechamento real do dia.
            const inicioMin = inicioPorPeriodo[periodo];
            const duracaoComPausaMin = (candidato.jornadaDiariaHoras + candidato.pausaAlmocoMinutos / 60) * 60;
            const fimMin = Math.min(inicioMin + duracaoComPausaMin, fechamentoMin);

            novosTurnos.push({
              restaurante_id: gerente.restauranteId,
              escala_id: escalaId,
              funcionario_id: candidato.id,
              zona_id: zonaId,
              dia_semana: dia,
              periodo,
              hora_inicio: paraHora(inicioMin),
              hora_fim: paraHora(fimMin),
              fora_preferencia: !respeitarPreferencia,
              status: "agendado",
            });

            diasOcupados.get(candidato.id)?.add(dia);
            vagasRestantes--;
          }
        }

        if (vagasRestantes > 0) vagasSemCandidato += vagasRestantes;
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