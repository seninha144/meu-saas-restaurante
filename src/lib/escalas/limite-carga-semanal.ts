export interface ConfiguracaoHorasExtrasRestaurante {
  permiteHorasExtras: boolean;
  limiteHorasExtrasSemanais: number;
}

export interface ConfiguracaoHorasExtrasFuncionario {
  cargaHorariaSemanalMax: number;
  aceitaHorasExtras: boolean;
}

export function normalizarLimiteHorasExtras(
  permiteHorasExtras: boolean,
  limiteHorasExtrasSemanais: number
): number {
  if (!permiteHorasExtras) return 0;
  return limiteHorasExtrasSemanais === 1 || limiteHorasExtrasSemanais === 2
    ? limiteHorasExtrasSemanais
    : 0;
}

export function horasExtrasPermitidas(
  restaurante: ConfiguracaoHorasExtrasRestaurante,
  funcionario: ConfiguracaoHorasExtrasFuncionario
): number {
  if (!restaurante.permiteHorasExtras || !funcionario.aceitaHorasExtras) return 0;
  return normalizarLimiteHorasExtras(true, restaurante.limiteHorasExtrasSemanais);
}

export function limiteAutomaticoFuncionario(
  restaurante: ConfiguracaoHorasExtrasRestaurante,
  funcionario: ConfiguracaoHorasExtrasFuncionario
): number {
  return Math.max(0, funcionario.cargaHorariaSemanalMax) +
    horasExtrasPermitidas(restaurante, funcionario);
}

export function cabeNoLimiteAutomatico(
  horasPlanejadas: number,
  horasDoNovoTurno: number,
  limiteAutomatico: number
): boolean {
  const minutosPlanejados = Math.round(horasPlanejadas * 60);
  const minutosNovoTurno = Math.round(horasDoNovoTurno * 60);
  const minutosLimite = Math.round(limiteAutomatico * 60);
  return minutosPlanejados + minutosNovoTurno <= minutosLimite;
}
