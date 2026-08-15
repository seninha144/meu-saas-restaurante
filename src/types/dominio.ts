export type PapelUsuario = "super_admin" | "gerente" | "funcionario";
export interface Usuario { id: string; nomeCompleto: string; email: string; papel: PapelUsuario; restauranteId: string | null; }
export type Plano = "trial" | "basico" | "pro";
export type StatusAssinatura = "trial" | "active" | "canceled";
export type FrequenciaPagamento = "dia" | "semana" | "quinzena" | "mes";

export interface Restaurante {
  id: string; nome: string; pais: "BR" | "PT"; moeda: "BRL" | "EUR"; usaZonas: boolean;
  plano: Plano; maxFuncionarios: number; permiteIA: boolean; statusAssinatura: StatusAssinatura;
  trialEndsAt: string; valorHoraPadrao: number; frequenciaPagamentoPadrao: FrequenciaPagamento;
  onboardingConcluido: boolean; diasFuncionamento: number[]; coberturaFdsPrioritaria: boolean;
  pontoAutomatico: boolean;
}

export interface HorarioFuncionamento { diaSemana: number; fechado: boolean; horaAbertura: string | null; horaFechamento: string | null; }
export interface Zona { id: string; restauranteId: string; nome: string; cor: string; ordem: number; capacidadeMinima: number; }
export type Periodo = "Manhã" | "Tarde" | "Noite" | "Fechamento";
export const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];
export type Genero = "masculino" | "feminino" | "outro" | "prefiro_nao_informar";
export interface DisponibilidadeDia { diaSemana: number; disponivel: boolean; periodosPreferidos: Periodo[]; }

export interface Funcionario {
  id: string; restauranteId: string; nome: string; cargo: string; zonaId: string | null; iniciais: string;
  idade: number | null; genero: Genero | null; horasSemana: number; cargaHorariaSemanalMax: number;
  folgasUsadas: number; folgasObrigatorias: number; disponibilidade: DisponibilidadeDia[]; ativo: boolean;
  valorHora: number | null; frequenciaPagamento: FrequenciaPagamento | null; pausaAlmocoMinutos: number; ehGerencia: boolean;
}

export interface Turno {
  id: string; funcionarioId: string; zonaId: string | null; periodo: Periodo; dia: number;
  horaInicio: string | null; horaFim: string | null; foraPreferencia: boolean;
}

export type NivelAlerta = "critico" | "atencao";
export interface Alerta { dia: number; periodo: Periodo; descricao: string; nivel: NivelAlerta; }

export type OrigemPonto = "manual" | "automatico";
export interface RegistroPonto { id: string; funcionarioId: string; entrada: string; saida: string | null; horasTrabalhadas: number | null; pago: boolean; origem: OrigemPonto; }

export interface ResumoPagamento {
  horasFinalizadasNaoPagas: number; valorFinalizadoNaoPago: number; horasEmAndamento: number;
  valorEmAndamento: number; valorHora: number; pontoEmAberto: boolean; desdeMaisAntigo: string | null;
}
export interface PagamentoHistorico { id: string; funcionarioId: string; periodoInicio: string; periodoFim: string; horasPagas: number; valorPago: number; pagoEm: string; }

export type TipoNotificacao = "cobertura" | "pagamento" | "assinatura";
export interface Notificacao { id: string; tipo: TipoNotificacao; titulo: string; descricao: string; href: string; nivel: "info" | "atencao"; }