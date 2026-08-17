export type PapelUsuario = "super_admin" | "gerente" | "funcionario";

export interface Usuario {
  id: string;
  nomeCompleto: string;
  email: string;
  papel: PapelUsuario;
  restauranteId: string | null;
}

export type Plano = "trial" | "basico" | "pro";
export type StatusAssinatura = "trial" | "active" | "canceled";
export type FrequenciaPagamento = "dia" | "semana" | "quinzena" | "mes";

export interface Restaurante {
  id: string;
  nome: string;
  pais: "BR" | "PT";
  moeda: "BRL" | "EUR";
  usaZonas: boolean;
  plano: Plano;
  maxFuncionarios: number;
  permiteIA: boolean;
  statusAssinatura: StatusAssinatura;
  trialEndsAt: string;
  valorHoraPadrao: number;
  frequenciaPagamentoPadrao: FrequenciaPagamento;
  onboardingConcluido: boolean;
  diasFuncionamento: number[];
  coberturaFdsPrioritaria: boolean;
  pontoAutomatico: boolean;
}

export interface HorarioFuncionamento {
  diaSemana: number;
  fechado: boolean;
  horaAbertura: string | null;
  horaFechamento: string | null;
}

export interface Zona {
  id: string;
  restauranteId: string;
  nome: string;
  cor: string;
  ordem: number;
  capacidadeMinima: number;
}

/**
 * Período de um turno efetivamente atribuído.
 *
 * "Total" NÃO pertence a este tipo.
 * A tabela public.turnos continua usando os períodos de turno.
 */
export type Periodo =
  | "Manhã"
  | "Tarde"
  | "Noite"
  | "Fechamento";

export const PERIODOS: Periodo[] = [
  "Manhã",
  "Tarde",
  "Noite",
  "Fechamento",
];

/**
 * Período/categoria usado exclusivamente na disponibilidade
 * dos funcionários.
 *
 * "Total" significa que o funcionário pode ser considerado
 * para qualquer período necessário naquele dia.
 *
 * "Total" NÃO é um turno.
 */
export type PeriodoDisponibilidade =
  | "Manhã"
  | "Tarde"
  | "Fechamento"
  | "Total";

export const PERIODOS_DISPONIBILIDADE: PeriodoDisponibilidade[] = [
  "Manhã",
  "Tarde",
  "Fechamento",
  "Total",
];

export type Genero =
  | "masculino"
  | "feminino"
  | "outro"
  | "prefiro_nao_informar";

export interface DisponibilidadeDia {
  diaSemana: number;
  disponivel: boolean;
  periodosPreferidos: PeriodoDisponibilidade[];
}

/**
 * Período operacional: conceito de "momento do dia" usado para configurar
 * movimento e necessidade de equipa no onboarding.
 *
 * NÃO é um horário fixo (cada restaurante abre/fecha a horas diferentes)
 * e NÃO deve ser confundido com `Periodo` (turno atribuído) nem com
 * `PeriodoDisponibilidade` (preferência do funcionário).
 */
export type PeriodoOperacional =
  | "Abertura"
  | "Almoço"
  | "Tarde"
  | "Fechamento";

export const PERIODOS_OPERACIONAIS: PeriodoOperacional[] = [
  "Abertura",
  "Almoço",
  "Tarde",
  "Fechamento",
];

export type NivelMovimento = "baixo" | "normal" | "alto" | "muito_alto";

export const NIVEIS_MOVIMENTO: NivelMovimento[] = [
  "baixo",
  "normal",
  "alto",
  "muito_alto",
];

export const LABEL_NIVEL_MOVIMENTO: Record<NivelMovimento, string> = {
  baixo: "Baixo",
  normal: "Normal",
  alto: "Alto",
  muito_alto: "Muito alto",
};

export interface MovimentoOperacional {
  diaSemana: number;
  periodo: PeriodoOperacional;
  nivel: NivelMovimento;
}

export interface NecessidadeEquipe {
  diaSemana: number;
  periodo: PeriodoOperacional;
  zonaId: string | null;
  funcao: string | null;
  minimo: number;
  ideal: number;
  maximo: number;
}

export interface Funcionario {
  id: string;
  restauranteId: string;
  nome: string;
  cargo: string;
  zonaId: string | null;
  iniciais: string;
  idade: number | null;
  genero: Genero | null;
  horasSemana: number;
  cargaHorariaSemanalMax: number;
  folgasUsadas: number;
  folgasObrigatorias: number;
  disponibilidade: DisponibilidadeDia[];
  ativo: boolean;
  valorHora: number | null;
  frequenciaPagamento: FrequenciaPagamento | null;
  pausaAlmocoMinutos: number;
  ehGerencia: boolean;
}

export interface Turno {
  id: string;
  funcionarioId: string;
  zonaId: string | null;
  periodo: Periodo;
  dia: number;
  horaInicio: string | null;
  horaFim: string | null;
  foraPreferencia: boolean;
}

export type NivelAlerta = "critico" | "atencao";

export interface Alerta {
  dia: number;
  periodo: Periodo;
  descricao: string;
  nivel: NivelAlerta;
}

export type OrigemPonto = "manual" | "automatico";

export interface RegistroPonto {
  id: string;
  funcionarioId: string;
  entrada: string;
  saida: string | null;
  horasTrabalhadas: number | null;
  pago: boolean;
  origem: OrigemPonto;
}

export interface ResumoPagamento {
  horasFinalizadasNaoPagas: number;
  valorFinalizadoNaoPago: number;
  horasEmAndamento: number;
  valorEmAndamento: number;
  valorHora: number;
  pontoEmAberto: boolean;
  desdeMaisAntigo: string | null;
}

export interface PagamentoHistorico {
  id: string;
  funcionarioId: string;
  periodoInicio: string;
  periodoFim: string;
  horasPagas: number;
  valorPago: number;
  pagoEm: string;
}

export type TipoNotificacao =
  | "cobertura"
  | "pagamento"
  | "assinatura";

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  descricao: string;
  href: string;
  nivel: "info" | "atencao";
}