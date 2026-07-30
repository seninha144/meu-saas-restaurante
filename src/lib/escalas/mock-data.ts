import type { Alerta, Funcionario, Turno } from "@/types/dominio";

/* =====================================================================
 * DADOS DE EXEMPLO
 * Troque por chamadas reais: `supabase.from("funcionarios").select("*")`,
 * `supabase.from("turnos").select("*")` e os `gaps` retornados por
 * `gerarEscalaSemanal(...)`.
 * ===================================================================== */
export const FUNCIONARIOS_MOCK: Funcionario[] = [
  { id: "f1", nome: "Ana Ribeiro", cargo: "Garçonete", setor: "salao", iniciais: "AR", horasSemana: 46, cargaAlvo: 44, folgasUsadas: 1, folgasObrigatorias: 2 },
  { id: "f2", nome: "Pedro Alves", cargo: "Cozinheiro", setor: "cozinha", iniciais: "PA", horasSemana: 40, cargaAlvo: 44, folgasUsadas: 2, folgasObrigatorias: 2 },
  { id: "f3", nome: "Bruna Lima", cargo: "Bartender", setor: "bar", iniciais: "BL", horasSemana: 42, cargaAlvo: 44, folgasUsadas: 1, folgasObrigatorias: 2 },
  { id: "f4", nome: "Carlos Dias", cargo: "Caixa", setor: "caixa", iniciais: "CD", horasSemana: 36, cargaAlvo: 44, folgasUsadas: 2, folgasObrigatorias: 2 },
  { id: "f5", nome: "Marta Sousa", cargo: "Chapeira", setor: "cozinha", iniciais: "MS", horasSemana: 48, cargaAlvo: 44, folgasUsadas: 1, folgasObrigatorias: 2 },
  { id: "f6", nome: "Tiago Rocha", cargo: "Garçom", setor: "salao", iniciais: "TR", horasSemana: 44, cargaAlvo: 44, folgasUsadas: 2, folgasObrigatorias: 2 },
  { id: "f7", nome: "Sofia Reis", cargo: "Bartender", setor: "bar", iniciais: "SR", horasSemana: 30, cargaAlvo: 44, folgasUsadas: 2, folgasObrigatorias: 2 },
  { id: "f8", nome: "Inês Costa", cargo: "Caixa", setor: "caixa", iniciais: "IC", horasSemana: 41, cargaAlvo: 44, folgasUsadas: 1, folgasObrigatorias: 2 },
];

export const TURNOS_MOCK: Turno[] = [
  { id: "t1", funcionarioId: "f2", setor: "cozinha", periodo: "Manhã", dia: 0 },
  { id: "t2", funcionarioId: "f5", setor: "cozinha", periodo: "Tarde", dia: 0 },
  { id: "t3", funcionarioId: "f1", setor: "salao", periodo: "Noite", dia: 0 },
  { id: "t4", funcionarioId: "f3", setor: "bar", periodo: "Noite", dia: 0 },
  { id: "t5", funcionarioId: "f4", setor: "caixa", periodo: "Tarde", dia: 1 },
  { id: "t6", funcionarioId: "f6", setor: "salao", periodo: "Manhã", dia: 2 },
  { id: "t7", funcionarioId: "f2", setor: "cozinha", periodo: "Noite", dia: 3 },
  { id: "t8", funcionarioId: "f5", setor: "cozinha", periodo: "Fechamento", dia: 4 },
  { id: "t9", funcionarioId: "f1", setor: "salao", periodo: "Tarde", dia: 4 },
  { id: "t10", funcionarioId: "f7", setor: "bar", periodo: "Tarde", dia: 5 },
  { id: "t11", funcionarioId: "f8", setor: "caixa", periodo: "Noite", dia: 5 },
  { id: "t12", funcionarioId: "f3", setor: "bar", periodo: "Fechamento", dia: 5 },
  { id: "t13", funcionarioId: "f6", setor: "salao", periodo: "Fechamento", dia: 6 },
];

export const ALERTAS_MOCK: Alerta[] = [
  { dia: 5, periodo: "Noite", descricao: "Sábado à noite precisa de +2 Garçons e +1 Cozinheiro", nivel: "critico" },
  { dia: 6, periodo: "Fechamento", descricao: "Domingo no fechamento precisa de +1 Bartender", nivel: "critico" },
];