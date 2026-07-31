/**
 * O gerente escolhe a cor da zona a partir desta paleta fixa (não um
 * color-picker livre) — garante que qualquer zona criada por qualquer
 * restaurante continue combinando com o tema dark do painel.
 */
export const PALETA_ZONAS = [
  { nome: "Âmbar", hex: "#E8A33D" },
  { nome: "Teal", hex: "#3EC6B9" },
  { nome: "Roxo", hex: "#9B7BD1" },
  { nome: "Azul", hex: "#6B8CAE" },
  { nome: "Rosa", hex: "#D97AA0" },
  { nome: "Verde", hex: "#6FBF73" },
  { nome: "Coral", hex: "#E08A6B" },
  { nome: "Lilás", hex: "#8E8FE0" },
] as const;

export function corPadraoZona(indice: number): string {
  return PALETA_ZONAS[indice % PALETA_ZONAS.length].hex;
}