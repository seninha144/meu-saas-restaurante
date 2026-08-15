import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PERIODOS = ["Manhã", "Tarde", "Noite", "Fechamento"] as const;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date();
  const diaSemanaHoje = (agora.getUTCDay() + 6) % 7;
  const horaAtual = `${String(agora.getUTCHours()).padStart(2, "0")}:${String(agora.getUTCMinutes()).padStart(2, "0")}`;
  const hojeISO = agora.toISOString().slice(0, 10);
  const inicioSemana = new Date(agora);
  inicioSemana.setUTCDate(inicioSemana.getUTCDate() - diaSemanaHoje);
  const semanaInicioISO = inicioSemana.toISOString().slice(0, 10);

  const { data: restaurantes } = await admin.from("restaurantes").select("id").eq("ponto_automatico", true);
  let entradasAbertas = 0;
  let saidasFechadas = 0;

  for (const restaurante of restaurantes ?? []) {
    const { data: escala } = await admin
      .from("escalas")
      .select("id")
      .eq("restaurante_id", restaurante.id)
      .eq("semana_inicio", semanaInicioISO)
      .maybeSingle();
    if (!escala) continue;

    const { data: turnosHoje } = await admin
      .from("turnos")
      .select("funcionario_id, hora_inicio, hora_fim")
      .eq("escala_id", escala.id)
      .eq("dia_semana", diaSemanaHoje)
      .in("periodo", PERIODOS);

    for (const turno of turnosHoje ?? []) {
      if (!turno.hora_inicio || !turno.hora_fim) continue;
      const horaInicio = String(turno.hora_inicio).slice(0, 5);
      const horaFim = String(turno.hora_fim).slice(0, 5);

      // já passou da entrada e ninguém abriu ponto ainda hoje -> abre automático
      if (horaInicio <= horaAtual) {
        const { data: existente } = await admin
          .from("registros_ponto")
          .select("id")
          .eq("funcionario_id", turno.funcionario_id)
          .gte("entrada", `${hojeISO}T00:00:00Z`)
          .maybeSingle();

        if (!existente) {
          await admin.from("registros_ponto").insert({
            restaurante_id: restaurante.id,
            funcionario_id: turno.funcionario_id,
            entrada: `${hojeISO}T${horaInicio}:00Z`,
            origem: "automatico",
          });
          entradasAbertas++;
        }
      }

      // já passou do fim do turno e existe um ponto automático ainda aberto -> fecha
      if (horaFim <= horaAtual) {
        const { data: aberto } = await admin
          .from("registros_ponto")
          .select("id")
          .eq("funcionario_id", turno.funcionario_id)
          .eq("origem", "automatico")
          .is("saida", null)
          .maybeSingle();

        if (aberto) {
          await admin.from("registros_ponto").update({ saida: `${hojeISO}T${horaFim}:00Z` }).eq("id", aberto.id);
          saidasFechadas++;
        }
      }
    }
  }

  return NextResponse.json({ entradasAbertas, saidasFechadas });
}