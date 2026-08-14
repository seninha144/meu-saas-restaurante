import { requireGerente } from "@/lib/auth/permissions";
import { getFuncionarios } from "@/lib/data/funcionarios";
import { getResumosPagamentoTodos } from "@/lib/data/pagamentos";
import { getSemana, toISODate } from "@/lib/dates";
import { PagamentosTable } from "./PagamentosTable";

export const dynamic = "force-dynamic";

export default async function PagamentosPage() {
  const gerente = await requireGerente();
  const { inicio } = getSemana(0);

  const [funcionarios, resumos] = await Promise.all([
    getFuncionarios(gerente.restauranteId, toISODate(inicio)),
    getResumosPagamentoTodos(gerente.restauranteId),
  ]);

  const linhas = funcionarios
    .map((f) => ({ funcionario: f, resumo: resumos.get(f.id) }))
    .filter((l): l is { funcionario: typeof l.funcionario; resumo: NonNullable<typeof l.resumo> } => !!l.resumo)
    .sort((a, b) => b.resumo.valorFinalizadoNaoPago - a.resumo.valorFinalizadoNaoPago);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-10">
      <h1 className="font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
        Pagamentos
      </h1>
      <p className="mt-1 text-sm text-white/40">
        Saldo pendente de cada colaborador — pontos já fechados e ainda não pagos.
      </p>

      <PagamentosTable linhas={linhas} />
    </div>
  );
}