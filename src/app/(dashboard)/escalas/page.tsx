import { GradeSemanal } from "@/components/escalas/GradeSemanal";
import { ALERTAS_MOCK, FUNCIONARIOS_MOCK, TURNOS_MOCK } from "@/lib/escalas/mock-data";

export default function EscalasPage() {
  return (
    <main className="p-6">
      <GradeSemanal 
        funcionarios={FUNCIONARIOS_MOCK} 
        turnosIniciais={TURNOS_MOCK} 
        alertas={ALERTAS_MOCK} 
      />
    </main>
  );
}