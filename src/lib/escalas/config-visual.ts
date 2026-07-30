import { Flame, Waves, Martini, Wallet, type LucideIcon } from "lucide-react";
import type { Periodo, SetorKey } from "@/types/dominio";

/* =====================================================================
 * Trilho de cores por setor — o "signature element" do painel.
 * Cada setor mantém a mesma cor em toda a interface (card, filtro,
 * barra lateral da linha), funcionando como código visual.
 * ===================================================================== */
export interface SetorToken {
  label: string;
  icon: LucideIcon;
  accent: string; // hex usado em estilos inline (dot do filtro)
  bg: string; // classe Tailwind
  text: string; // classe Tailwind
  bar: string; // classe Tailwind
}

export const SETOR_TOKENS: Record<SetorKey, SetorToken> = {
  cozinha: {
    label: "Cozinha",
    icon: Flame,
    accent: "#E8A33D",
    bg: "bg-[#E8A33D]/10",
    text: "text-[#E8A33D]",
    bar: "bg-[#E8A33D]",
  },
  salao: {
    label: "Salão",
    icon: Waves,
    accent: "#3EC6B9",
    bg: "bg-[#3EC6B9]/10",
    text: "text-[#3EC6B9]",
    bar: "bg-[#3EC6B9]",
  },
  bar: {
    label: "Bar",
    icon: Martini,
    accent: "#9B7BD1",
    bg: "bg-[#9B7BD1]/10",
    text: "text-[#9B7BD1]",
    bar: "bg-[#9B7BD1]",
  },
  caixa: {
    label: "Caixa",
    icon: Wallet,
    accent: "#6B8CAE",
    bg: "bg-[#6B8CAE]/10",
    text: "text-[#6B8CAE]",
    bar: "bg-[#6B8CAE]",
  },
};

export const PERIODOS: Periodo[] = ["Manhã", "Tarde", "Noite", "Fechamento"];

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;