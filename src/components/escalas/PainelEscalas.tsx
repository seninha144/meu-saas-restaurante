"use client";

import { useState } from "react";
import { GradeSemanal } from "./GradeSemanal";
import { SeletorSemana } from "./SeletorSemana";
import { FuncionarioModal } from "@/components/funcionarios/FuncionarioModal";
import { GestaoZonasModal } from "@/components/zonas/GestaoZonasModal";
import type { Alerta, Funcionario, Turno, Zona } from "@/types/dominio";

interface PainelEscalasProps {
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  alertas: Alerta[];
  dias: Date[];
  offsetAtual: number;
}

export function PainelEscalas({
  zonas,
  usaZonas,
  funcionarios,
  turnos,
  alertas,
  dias,
  offsetAtual,
}: PainelEscalasProps) {
  const [modalFuncionario, setModalFuncionario] = useState<Funcionario | "novo" | null>(null);
  const [modalZonas, setModalZonas] = useState(false);

  return (
    <>
      <SeletorSemana inicio={dias[0]} fim={dias[6]} offsetAtual={offsetAtual} />

      <GradeSemanal
        zonas={zonas}
        usaZonas={usaZonas}
        funcionarios={funcionarios}
        turnos={turnos}
        alertas={alertas}
        dias={dias}
        onAbrirNovoFuncionario={() => setModalFuncionario("novo")}
        onAbrirGestaoZonas={() => setModalZonas(true)}
        onEditarFuncionario={(f) => setModalFuncionario(f)}
      />

      {modalFuncionario && (
        <FuncionarioModal
          funcionario={modalFuncionario === "novo" ? null : modalFuncionario}
          zonas={zonas}
          usaZonas={usaZonas}
          onFechar={() => setModalFuncionario(null)}
        />
      )}

      {modalZonas && <GestaoZonasModal zonas={zonas} usaZonas={usaZonas} onFechar={() => setModalZonas(false)} />}
    </>
  );
}