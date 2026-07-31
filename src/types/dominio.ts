/* =====================================================================
 * TIPOS DE DOMÍNIO
 * Zona não é mais um enum fixo — é uma entidade dinâmica, criada e
 * mantida pelo próprio gerente. `zonaId: null` representa "sem zona"
 * (restaurante em modo linear, ou colaborador ainda não alocado).
 * ===================================================================== */

export type PapelUsuario = "super_admin" | "gerente" | "funcionario";

export interface Usuario {
  id: string;
  nomeCompleto: string;
  email: string;
  papel: PapelUsuario;
  restauranteId: string | null; // null apenas para super_admin
}

export interface Restaurante {
  id: string;
  nome: string;
  pais: "BR" | "PT";
  moeda: "BRL" | "EUR";
  usaZonas: boolean;
}

export interface Zona {
  id: string;
  restauranteId: string;
  nome: string;
  cor: string; // hex, escolhido de PALETA_ZONAS
  ordem: number;
  capacidadeMinima: number;
}

export type Periodo = "Manhã" | "Tarde" | "Noite" | "Fechamento";
export const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];

export type Genero = "masculino" | "feminino" | "outro" | "prefiro_nao_informar";

export interface DisponibilidadeDia {
  diaSemana: number; // 0 = Segunda ... 6 = Domingo
  disponivel: boolean;
  periodosPreferidos: Periodo[]; // vazio = sem preferência
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
  horasSemana: number; // calculado a partir dos turnos da semana exibida
  cargaHorariaSemanalMax: number; // ex: 44, 30 — referência de hora extra
  folgasUsadas: number;
  folgasObrigatorias: number;
  disponibilidade: DisponibilidadeDia[];
  ativo: boolean;
}

export interface Turno {
  id: string;
  funcionarioId: string;
  zonaId: string | null;
  periodo: Periodo;
  dia: number; // 0-6, relativo à semana exibida
}

export type NivelAlerta = "critico" | "atencao";

export interface Alerta {
  dia: number;
  periodo: Periodo;
  descricao: string;
  nivel: NivelAlerta;
}