import { createClient } from "@/lib/supabase/server";
import { getSemana, toISODate } from "@/lib/dates";
import { getAlertasCobertura } from "./escalas";
import { getResumosPagamentoTodos } from "./pagamentos";
import type { Notificacao } from "@/types/dominio";

export async function getNotificacoes(restauranteId: string): Promise<Notificacao[]> {
  const supabase = await createClient();
  const notificacoes: Notificacao[] = [];

  // cobertura da próxima semana
  const { inicio: inicioProxima } = getSemana(1);
  const semanaInicioISO = toISODate(inicioProxima);
  const { data: escalaProxima } = await supabase
    .from("escalas")
    .select("id")
    .eq("restaurante_id", restauranteId)
    .eq("semana_inicio", semanaInicioISO)
    .maybeSingle();

  if (escalaProxima) {
    const alertas = await getAlertasCobertura(restauranteId, escalaProxima.id);
    if (alertas.length > 0) {
      notificacoes.push({
        id: "cobertura-proxima-semana",
        tipo: "cobertura",
        titulo: `${alertas.length} turno(s) da próxima semana sem cobertura`,
        descricao: alertas[0].descricao,
        href: "/escalas?semana=1",
        nivel: "atencao",
      });
    }
  }

  // saldo de pagamento pendente
  const resumos = await getResumosPagamentoTodos(restauranteId);
  const pendentes = Array.from(resumos.values()).filter((r) => r.valorFinalizadoNaoPago > 0);
  if (pendentes.length > 0) {
    notificacoes.push({
      id: "pagamentos-pendentes",
      tipo: "pagamento",
      titulo: `${pendentes.length} colaborador(es) com saldo pendente`,
      descricao: "Revise a folha antes do fechamento do ciclo.",
      href: "/pagamentos",
      nivel: "info",
    });
  }

  // trial acabando
  const { data: restaurante } = await supabase
    .from("restaurantes")
    .select("status_assinatura, trial_ends_at")
    .eq("id", restauranteId)
    .single();
  if (restaurante?.status_assinatura === "trial") {
    const diasRestantes = Math.ceil((new Date(restaurante.trial_ends_at).getTime() - Date.now()) / 86_400_000);
    if (diasRestantes <= 3) {
      notificacoes.push({
        id: "trial-acabando",
        tipo: "assinatura",
        titulo: diasRestantes <= 0 ? "Seu teste expirou" : `Seu teste acaba em ${diasRestantes} dia(s)`,
        descricao: "Escolha um plano pra não perder acesso.",
        href: "/bloqueio",
        nivel: "atencao",
      });
    }
  }

  return notificacoes;
}

/** "Hoje é dia de pagamento" — só faz sentido pra ciclo mensal (dias 1-5 do mês). */
export function ehDiaDePagamento(frequenciaPagamentoPadrao: string): boolean {
  if (frequenciaPagamentoPadrao !== "mes") return false;
  const hoje = new Date();
  let diasUteis = 0;
  for (let dia = 1; dia <= hoje.getUTCDate(); dia++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), dia));
    const diaSemana = d.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) diasUteis++;
  }
  return diasUteis === 5;
}