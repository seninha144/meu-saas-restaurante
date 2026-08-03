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
  // --- plano / assinatura ---
  plano: Plano;
  maxFuncionarios: number;
  permiteIA: boolean;
  statusAssinatura: StatusAssinatura;
  trialEndsAt: string; // ISO datetime
  // --- perfil financeiro padrão (herdado pelos funcionários) ---
  valorHoraPadrao: number;
  frequenciaPagamentoPadrao: FrequenciaPagamento;
  // --- onboarding operacional ---
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
  valorHora: number | null;
  frequenciaPagamento: FrequenciaPagamento | null;
}

export interface Turno {
  id: string;
  funcionarioId: string;
  zonaId: string | null;
  periodo: Periodo;
  dia: number;
}

export type NivelAlerta = "critico" | "atencao";

export interface Alerta {
  dia: number;
  periodo: Periodo;
  descricao: string;
  nivel: NivelAlerta;
}

export interface ResumoPagamento {
  frequencia: FrequenciaPagamento;
  cicloInicio: string;
  cicloFim: string;
  horasTrabalhadas: number;
  valorHora: number;
  valorTotal: number;
  jaPago: boolean;
}

export interface PagamentoHistorico {
  id: string;
  funcionarioId: string;
  cicloInicio: string;
  cicloFim: string;
  horasTrabalhadas: number;
  valorPago: number;
  pagoEm: string;
}