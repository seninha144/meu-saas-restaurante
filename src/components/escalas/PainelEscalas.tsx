"use client";

import { useState } from "react";
import { GradeSemanal } from "./GradeSemanal";
import { SeletorSemana } from "./SeletorSemana";
import { FuncionarioModal } from "@/components/funcionarios/FuncionarioModal";
import { GestaoZonasModal } from "@/components/zonas/GestaoZonasModal";
import type { Alerta, Funcionario, HorarioFuncionamento, Turno, Zona } from "@/types/dominio";

interface PainelEscalasProps {
  escalaId: string;
  zonas: Zona[];
  usaZonas: boolean;
  funcionarios: Funcionario[];
  turnos: Turno[];
  alertas: Alerta[];
  dias: Date[];
  diasFuncionamento: number[];
  horarios: HorarioFuncionamento[];
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
  horarios,
  offsetAtual,
}: PainelEscalasProps) {
  const [modalFuncionario, setModalFuncionario] = useState<Funcionario | "novo" | null>(null);
  const [modalZonas, setModalZonas] = useState(false);

  return (
    <>
     <SeletorSemana
  escalaId={escalaId}
  inicio={dias[0]}
  fim={dias[6]}
  offsetAtual={offsetAtual}
/>

      <GradeSemanal
        escalaId={escalaId}
        zonas={zonas}
        usaZonas={usaZonas}
        funcionarios={funcionarios}
        turnos={turnos}
        possuiTurnos={turnos.length > 0}
        alertas={alertas}
        dias={dias}
        diasFuncionamento={diasFuncionamento}
        horarios={horarios}
        onAbrirNovoFuncionario={() => setModalFuncionario("novo")}
        onAbrirGestaoZonas={() => setModalZonas(true)}
        onEditarFuncionario={(f) => setModalFuncionario(f)}
      />

      {modalFuncionario && (
        <FuncionarioModal
          funcionario={modalFuncionario === "novo" ? null : modalFuncionario}
          zonas={zonas}
          usaZonas={usaZonas}
          diasFuncionamento={diasFuncionamento}
          onFechar={() => setModalFuncionario(null)}
        />
      )}

      {modalZonas && <GestaoZonasModal zonas={zonas} usaZonas={usaZonas} onFechar={() => setModalZonas(false)} />}
    </>
  );
}
