/* =====================================================================
 * TIPOS DE DOMÍNIO — Módulo de Escalas e RH
 * Espelham as tabelas do Supabase (zonas, funcionarios, turnos), mas em
 * camelCase para uso no front-end. O mapeamento snake_case -> camelCase
 * acontece na camada de acesso a dados (ex: hooks/useEscalas.ts).
 * ===================================================================== */

/** Chave estável de cada setor/zona operacional do restaurante. */
export type SetorKey = "cozinha" | "salao" | "bar" | "caixa";

/** Setor/zona, equivalente à tabela `zonas`. */
export interface Setor {
  key: SetorKey;
  nome: string;
}

/** Período do dia usado para organizar a grade semanal. */
export type Periodo = "Manhã" | "Tarde" | "Noite" | "Fechamento";

/** Colaborador, equivalente à tabela `funcionarios`. */
export interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  setor: SetorKey;
  iniciais: string;
  /** Horas já alocadas na semana corrente (soma dos turnos). */
  horasSemana: number;
  /** Limite de horas semanais considerado para alerta de hora extra (ex: 44). */
  cargaAlvo: number;
  folgasUsadas: number;
  folgasObrigatorias: number;
}

/** Um turno individual atribuído a um funcionário, equivalente à tabela `turnos`. */
export interface Turno {
  id: string;
  funcionarioId: string;
  setor: SetorKey;
  periodo: Periodo;
  /** 0 = Segunda ... 6 = Domingo */
  dia: number;
}

/** Cabeçalho de uma escala semanal, equivalente à tabela `escalas`. */
export interface Escala {
  id: string;
  semanaInicio: string; // ISO date (segunda-feira da semana)
  semanaFim: string; // ISO date
  status: "rascunho" | "publicada" | "arquivada";
  turnos: Turno[];
}

export type NivelAlerta = "critico" | "atencao";

/** Alerta de cobertura mínima não atingida em um turno/dia. */
export interface Alerta {
  dia: number;
  periodo: Periodo;
  descricao: string;
  nivel: NivelAlerta;
}