import { createClient } from "@/lib/supabase/server";
import type { ResumoPagamento } from "@/types/dominio";

export async function getResumoPagamento(funcionarioId: string, restauranteId: string): Promise<ResumoPagamento> {
  const supabase = await createClient();

  const [{ data: funcionario }, { data: restaurante }, { data: ultimoPagamento }] = await Promise.all([
    supabase.from("funcionarios").select("valor_hora, pausa_almoco_minutos, criado_em").eq("id", funcionarioId).single(),
    supabase.from("restaurantes").select("valor_hora_padrao").eq("id", restauranteId).single(),
    supabase
      .from("pagamentos_historico")
      .select("periodo_fim")
      .eq("funcionario_id", funcionarioId)
      .order("periodo_fim", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const valorHora = Number(funcionario?.valor_hora ?? restaurante?.valor_hora_padrao ?? 0);
  const pausaAlmocoHoras = (funcionario?.pausa_almoco_minutos ?? 30) / 60;
  const desde = ultimoPagamento?.periodo_fim ?? funcionario?.criado_em ?? new Date(0).toISOString();

  const { data: registros } = await supabase
    .from("registros_ponto")
    .select("entrada, saida")
    .eq("funcionario_id", funcionarioId)
    .gte("entrada", desde)
    .order("entrada", { ascending: true });

  let horasTrabalhadas = 0;
  let pontoEmAberto = false;
  const agora = new Date();

  for (const r of registros ?? []) {
    const entrada = new Date(r.entrada);

    if (r.saida) {
      const saida = new Date(r.saida);
      const horasBrutas = (saida.getTime() - entrada.getTime()) / 1000 / 60 / 60;
      // pausa só é descontada de turnos já fechados — um ponto em
      // andamento não sabemos ainda se a pessoa vai tirar a pausa.
      horasTrabalhadas += Math.max(0, horasBrutas - pausaAlmocoHoras);
    } else {
      pontoEmAberto = true;
      const horasBrutas = (agora.getTime() - entrada.getTime()) / 1000 / 60 / 60;
      horasTrabalhadas += Math.max(0, horasBrutas);
    }
  }

  return {
    desde,
    horasTrabalhadas: Math.round(horasTrabalhadas * 100) / 100,
    valorHora,
    valorTotal: Math.round(horasTrabalhadas * valorHora * 100) / 100,
    pontoEmAberto,
    ultimoPagamentoEm: ultimoPagamento?.periodo_fim ?? null,
  };
}