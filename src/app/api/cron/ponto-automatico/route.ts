import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FUSO_HORARIO_PADRAO, adicionarDias, dataISO, dataLocal, diaSemana,
  fusoHorarioValido, intervaloDoTurno,
} from "@/lib/ponto-automatico/horarios";

const PERIODOS = ["Manhã", "Tarde", "Noite", "Fechamento"] as const;
const ANTECEDENCIA_MANUAL_MS = 2 * 60 * 60 * 1000;
type AdminClient = ReturnType<typeof createAdminClient>;

function logErro(contexto: { restauranteId?: string; funcionarioId?: string; turnoId?: string; operacao: string; erro: unknown }) {
  const mensagem = contexto.erro && typeof contexto.erro === "object" && "message" in contexto.erro
    ? String(contexto.erro.message) : String(contexto.erro);
  console.error("[ponto-automatico]", { ...contexto, erro: mensagem });
}

function buscarRegistroDoTurno(admin: AdminClient, restauranteId: string, turnoId: string) {
  return admin.from("registros_ponto").select("id, saida, origem")
    .eq("restaurante_id", restauranteId).eq("turno_id", turnoId).maybeSingle();
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date();
  const { data: restaurantes, error: erroRestaurantes } = await admin
    .from("restaurantes").select("id, fuso_horario").eq("ponto_automatico", true);
  if (erroRestaurantes) {
    logErro({ operacao: "buscar_restaurantes", erro: erroRestaurantes });
    return NextResponse.json({ erro: "falha ao buscar restaurantes" }, { status: 500 });
  }

  let entradasAbertas = 0;
  let saidasFechadas = 0;

  for (const restaurante of restaurantes ?? []) {
    const configurado = restaurante.fuso_horario || FUSO_HORARIO_PADRAO;
    const fusoHorario = fusoHorarioValido(configurado) ? configurado : FUSO_HORARIO_PADRAO;
    if (fusoHorario !== configurado) {
      logErro({ restauranteId: restaurante.id, operacao: "validar_fuso_horario", erro: `fuso inválido; usando ${FUSO_HORARIO_PADRAO}` });
    }

    const hoje = dataLocal(agora, fusoHorario);
    // O dia anterior permite fechar turnos que atravessam a meia-noite e recuperar uma execução perdida.
    for (const dataTurno of [adicionarDias(hoje, -1), hoje]) {
      const indiceDia = diaSemana(dataTurno);
      const semanaInicioISO = dataISO(adicionarDias(dataTurno, -indiceDia));
      const { data: escala, error: erroEscala } = await admin.from("escalas").select("id")
        .eq("restaurante_id", restaurante.id).eq("semana_inicio", semanaInicioISO).maybeSingle();
      if (erroEscala) {
        logErro({ restauranteId: restaurante.id, operacao: "buscar_escala", erro: erroEscala });
        continue;
      }
      if (!escala) continue;

      const { data: turnos, error: erroTurnos } = await admin.from("turnos")
        .select("id, funcionario_id, restaurante_id, hora_inicio, hora_fim")
        .eq("escala_id", escala.id).eq("restaurante_id", restaurante.id)
        .eq("dia_semana", indiceDia).in("periodo", PERIODOS);
      if (erroTurnos) {
        logErro({ restauranteId: restaurante.id, operacao: "buscar_turnos", erro: erroTurnos });
        continue;
      }

      const ids = [...new Set((turnos ?? []).map((turno) => turno.funcionario_id))];
      const funcionariosValidos = new Set<string>();
      if (ids.length) {
        const { data: funcionarios, error } = await admin.from("funcionarios").select("id")
          .eq("restaurante_id", restaurante.id).in("id", ids);
        if (error) {
          logErro({ restauranteId: restaurante.id, operacao: "validar_funcionarios", erro: error });
          continue;
        }
        for (const funcionario of funcionarios ?? []) funcionariosValidos.add(funcionario.id);
      }

      for (const turno of turnos ?? []) {
        const contexto = { restauranteId: restaurante.id, funcionarioId: turno.funcionario_id, turnoId: turno.id };
        if (!turno.hora_inicio || !turno.hora_fim || turno.restaurante_id !== restaurante.id) continue;
        if (!funcionariosValidos.has(turno.funcionario_id)) {
          logErro({ ...contexto, operacao: "validar_turno", erro: "funcionário fora do restaurante" });
          continue;
        }

        const { inicio, fim } = intervaloDoTurno(dataTurno, String(turno.hora_inicio), String(turno.hora_fim), fusoHorario);
        if (agora < inicio) continue;

        const { data: registroExistente, error: erroRegistro } = await buscarRegistroDoTurno(admin, restaurante.id, turno.id);
        let registro = registroExistente;
        if (erroRegistro) {
          logErro({ ...contexto, operacao: "buscar_registro_turno", erro: erroRegistro });
          continue;
        }

        if (!registro) {
          const { data: manual, error: erroManual } = await admin.from("registros_ponto").select("id")
            .eq("restaurante_id", restaurante.id).eq("funcionario_id", turno.funcionario_id)
            .eq("origem", "manual")
            .lt("entrada", fim.toISOString())
            .or(`saida.is.null,entrada.gte.${new Date(inicio.getTime() - ANTECEDENCIA_MANUAL_MS).toISOString()}`)
            .limit(1).maybeSingle();
          if (erroManual) {
            logErro({ ...contexto, operacao: "buscar_ponto_manual", erro: erroManual });
            continue;
          }
          if (manual) continue;

          const { data: inserido, error: erroInsert } = await admin.from("registros_ponto").insert({
            restaurante_id: restaurante.id, funcionario_id: turno.funcionario_id,
            turno_id: turno.id, entrada: inicio.toISOString(), origem: "automatico",
          }).select("id, saida, origem").single();

          if (erroInsert || !inserido) {
            // O índice único transforma uma corrida entre crons em uma leitura do vencedor.
            const concorrente = await buscarRegistroDoTurno(admin, restaurante.id, turno.id);
            if (concorrente.error || !concorrente.data) {
              logErro({ ...contexto, operacao: "abrir_entrada", erro: erroInsert ?? "sem retorno" });
              continue;
            }
            registro = concorrente.data;
          } else {
            registro = inserido;
            entradasAbertas++;
          }
        }

        if (agora >= fim && registro?.origem === "automatico" && !registro.saida) {
          const { data: fechado, error } = await admin.from("registros_ponto")
            .update({ saida: fim.toISOString() }).eq("id", registro.id)
            .eq("restaurante_id", restaurante.id).eq("turno_id", turno.id)
            .is("saida", null).select("id").maybeSingle();
          if (error) logErro({ ...contexto, operacao: "fechar_saida", erro: error });
          else if (fechado) saidasFechadas++;
        }
      }
    }
  }

  return NextResponse.json({ entradasAbertas, saidasFechadas });
}
