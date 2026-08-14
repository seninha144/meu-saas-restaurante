import { createClient } from "@/lib/supabase/server";
import type { ResumoPagamento } from "@/types/dominio";

interface RegistroBase {
  entrada: string;
  saida: string | null;
  horas_trabalhadas: number | null;
}

function montarResumo(
  registros: RegistroBase[],
  valorHora: number,
  pausaHoras: number
): ResumoPagamento {
  let horasFinalizadasNaoPagas = 0;
  let horasEmAndamento = 0;
  let pontoEmAberto = false;
  let desdeMaisAntigo: string | null = null;
  const agora = new Date();

  for (const r of registros) {
    if (!desdeMaisAntigo || r.entrada < desdeMaisAntigo) desdeMaisAntigo = r.entrada;

    if (r.saida) {
      const horasBrutas = Number(r.horas_trabalhadas ?? 0);
      horasFinalizadasNaoPagas += Math.max(0, horasBrutas - pausaHoras);
    } else {
      pontoEmAberto = true;
      const horasBrutas = (agora.getTime() - new Date(r.entrada).getTime()) / 1000 / 60 / 60;
      horasEmAndamento += Math.max(0, horasBrutas);
    }
  }

  horasFinalizadasNaoPagas = Math.round(horasFinalizadasNaoPagas * 100) / 100;
  horasEmAndamento = Math.round(horasEmAndamento * 100) / 100;

  return {
    horasFinalizadasNaoPagas,
    valorFinalizadoNaoPago: Math.round(horasFinalizadasNaoPagas * valorHora * 100) / 100,
    horasEmAndamento,
    valorEmAndamento: Math.round(horasEmAndamento * valorHora * 100) / 100,
    valorHora,
    pontoEmAberto,
    desdeMaisAntigo,
  };
}

export async function getResumoPagamento(funcionarioId: string, restauranteId: string): Promise<ResumoPagamento> {
  const supabase = await createClient();

  const [{ data: funcionario }, { data: restaurante }, { data: registros }] = await Promise.all([
    supabase.from("funcionarios").select("valor_hora, pausa_almoco_minutos").eq("id", funcionarioId).single(),
    supabase.from("restaurantes").select("valor_hora_padrao").eq("id", restauranteId).single(),
    // pontos fechados não pagos + o ponto aberto (se houver) num único select
    supabase
      .from("registros_ponto")
      .select("entrada, saida, horas_trabalhadas")
      .eq("funcionario_id", funcionarioId)
      .or("and(saida.not.is.null,pago.eq.false),saida.is.null"),
  ]);

  const valorHora = Number(funcionario?.valor_hora ?? restaurante?.valor_hora_padrao ?? 0);
  const pausaHoras = (funcionario?.pausa_almoco_minutos ?? 30) / 60;

  return montarResumo(registros ?? [], valorHora, pausaHoras);
}

/**
 * Versão em lote pra página /pagamentos — uma query pro restaurante
 * inteiro em vez de N chamadas (importante com 30-50 funcionários).
 */
export async function getResumosPagamentoTodos(
  restauranteId: string
): Promise<Map<string, ResumoPagamento>> {
  const supabase = await createClient();

  const [{ data: funcionarios }, { data: restaurante }, { data: registros }] = await Promise.all([
    supabase
      .from("funcionarios")
      .select("id, valor_hora, pausa_almoco_minutos")
      .eq("restaurante_id", restauranteId)
      .eq("ativo", true),
    supabase.from("restaurantes").select("valor_hora_padrao").eq("id", restauranteId).single(),
    supabase
      .from("registros_ponto")
      .select("funcionario_id, entrada, saida, horas_trabalhadas")
      .eq("restaurante_id", restauranteId)
      .or("and(saida.not.is.null,pago.eq.false),saida.is.null"),
  ]);

  const valorHoraPadrao = Number(restaurante?.valor_hora_padrao ?? 0);
  const mapa = new Map<string, ResumoPagamento>();

  for (const f of funcionarios ?? []) {
    const valorHora = Number(f.valor_hora ?? valorHoraPadrao);
    const pausaHoras = (f.pausa_almoco_minutos ?? 30) / 60;
    const registrosDoFuncionario = (registros ?? []).filter((r) => r.funcionario_id === f.id);
    mapa.set(f.id, montarResumo(registrosDoFuncionario, valorHora, pausaHoras));
  }

  return mapa;
}