import { requireGerente } from "@/lib/auth/permissions";
import {
  getRestaurante,
  getZonas,
} from "@/lib/data/queries";
import { getFuncionarios } from "@/lib/data/funcionarios";
import {
  getOuCriarEscala,
  getTurnos,
  getAlertasCobertura,
} from "@/lib/data/escalas";
import { getHorarios } from "@/lib/data/horarios";
import { ehDiaDePagamento } from "@/lib/data/notificacoes";
import {
  getSemana,
  toISODate,
} from "@/lib/dates";
import { PainelEscalas } from "@/components/escalas/PainelEscalas";
import { BannerPagamento } from "@/components/pagamentos/BannerPagamento";

export const dynamic =
  "force-dynamic";

interface EscalasPageProps {
  searchParams: Promise<{
    semana?: string;
  }>;
}

export default async function EscalasPage({
  searchParams,
}: EscalasPageProps) {
  const gerente =
    await requireGerente();

  const { semana } =
    await searchParams;

  /*
   * O parâmetro "semana" representa
   * exclusivamente o número de semanas
   * a partir da semana atual:
   *
   * 0  = semana atual
   * -1 = semana anterior
   * +1 = semana seguinte
   *
   * O cálculo de Segunda → Domingo
   * é feito dentro de getSemana().
   */

  const numeroSemana =
    semana !== undefined
      ? Number(semana)
      : 0;

  const offsetAtual =
    Number.isFinite(
      numeroSemana
    )
      ? Math.trunc(
          numeroSemana
        )
      : 0;

  /*
   * getSemana() sempre devolve:
   *
   * inicio = Segunda-feira
   * fim    = Domingo
   * dias   = 7 dias consecutivos
   */
  const {
    inicio,
    fim,
    dias,
  } = getSemana(
    offsetAtual
  );

  const semanaInicioISO =
    toISODate(inicio);

  const [
    restaurante,
    zonas,
    funcionarios,
    horarios,
  ] = await Promise.all([
    getRestaurante(
      gerente.restauranteId
    ),
    getZonas(
      gerente.restauranteId
    ),
    getFuncionarios(
      gerente.restauranteId,
      semanaInicioISO
    ),
    getHorarios(
      gerente.restauranteId
    ),
  ]);

  /*
   * A escala é obtida para o intervalo
   * exato da semana:
   *
   * Segunda-feira → Domingo
   */
  const escala =
    await getOuCriarEscala(
      gerente.restauranteId,
      inicio,
      fim
    );

  const [
    turnos,
    alertas,
  ] = await Promise.all([
    getTurnos(
      escala.id
    ),
    getAlertasCobertura(
      gerente.restauranteId,
      escala.id
    ),
  ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10">
      {offsetAtual === 0 &&
        ehDiaDePagamento(
          restaurante.frequenciaPagamentoPadrao
        ) && (
          <BannerPagamento />
        )}

      <h1 className="font-[Space_Grotesk,system-ui,sans-serif] text-2xl font-semibold tracking-tight sm:text-3xl">
        Escala da semana
      </h1>

      <PainelEscalas
        escalaId={escala.id}
        zonas={zonas}
        usaZonas={
          restaurante.usaZonas
        }
        funcionarios={
          funcionarios
        }
        turnos={turnos}
        alertas={alertas}
        dias={dias}
        diasFuncionamento={
          restaurante.diasFuncionamento
        }
        horarios={horarios}
        offsetAtual={
          offsetAtual
        }
      />
    </div>
  );
}