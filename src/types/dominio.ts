/* =====================================================================
 * TIPOS DE DOMÍNIO
 * ===================================================================== */

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
  diasFuncionamento: number[]; // 0=Segunda ... 6=Domingo
  coberturaFdsPrioritaria: boolean;
}

export interface HorarioFuncionamento {
  diaSemana: number;
  fechado: boolean;
  horaAbertura: string | null; // "HH:MM"
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

export type Periodo = "Manhã" | "Tarde" | "Noite" | "Fechamento";
export const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];

export type Genero = "masculino" | "feminino" | "outro" | "prefiro_nao_informar";

export interface DisponibilidadeDia {
  diaSemana: number;
  disponivel: boolean;
  periodosPreferidos: Periodo[];
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
  valorHora: number | null; // null = herda valorHoraPadrao do restaurante
  frequenciaPagamento: FrequenciaPagamento | null; // sugestão de cadência, não trava o pagamento
  pausaAlmocoMinutos: number; // descontado das horas de cada turno fechado (com saída registrada)
}

/** Turno planejado na grade. horaInicio/horaFim alimentam a agenda por hora. */
export interface Turno {
  id: string;
  funcionarioId: string;
  zonaId: string | null;
  periodo: Periodo;
  dia: number; // 0-6, relativo à semana exibida
  horaInicio: string | null; // "HH:MM"
  horaFim: string | null;
}

export type NivelAlerta = "critico" | "atencao";

export interface Alerta {
  dia: number;
  periodo: Periodo;
  descricao: string;
  nivel: NivelAlerta;
}

/** Uma batida de ponto — entrada obrigatória, saída null enquanto em andamento. */
export interface RegistroPonto {
  id: string;
  funcionarioId: string;
  entrada: string; // ISO datetime
  saida: string | null;
  horasTrabalhadas: number | null; // calculado pelo banco quando saida existe
}

/**
 * Resumo do saldo pendente de pagamento — não é mais um "ciclo
 * calendário", é tudo que foi trabalhado (via registros_ponto) desde
 * o último pagamento (ou desde sempre, se nunca foi pago).
 */
export interface ResumoPagamento {
  desde: string; // ISO datetime — início da janela sendo somada
  horasTrabalhadas: number; // já inclui o ponto em andamento, se houver, calculado até agora
  valorHora: number;
  valorTotal: number;
  pontoEmAberto: boolean; // true = tem um registro sem saída agora
  ultimoPagamentoEm: string | null;
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