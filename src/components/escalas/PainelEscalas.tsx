"use client";

import { useState } from "react";
import { GradeSemanal } from "./GradeSemanal";
import { SeletorSemana } from "./SeletorSemana";
import { FuncionarioModal } from "@/components/funcionarios/FuncionarioModal";
import { GestaoZonasModal } from "@/components/zonas/GestaoZonasModal";
import type { Alerta, Funcionario, Turno, Zona } from "@/types/dominio";

interface PainelEscalasProps {
  escalaId: string;
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  alertas: Alerta[];
  dias: Date[];
  diasFuncionamento: number[];
  offsetAtual: number;
}

export function PainelEscalas({
  escalaId,
  zonas,
  usaZonas,
  funcionarios,
  turnos,
  alertas,
  dias,
  diasFuncionamento,
  offsetAtual,
}: PainelEscalasProps) {
  const [modalFuncionario, setModalFuncionario] = useState<Funcionario | "novo" | null>(null);
  const [modalZonas, setModalZonas] = useState(false);

  return (
    <>
      <SeletorSemana inicio={dias[0]} fim={dias[6]} offsetAtual={offsetAtual} />

      <GradeSemanal
        escalaId={escalaId}
        zonas={zonas}
        usaZonas={usaZonas}
        funcionarios={funcionarios}
        turnos={turnos}
        alertas={alertas}
        dias={dias}
        diasFuncionamento={diasFuncionamento}
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