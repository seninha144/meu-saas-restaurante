import { redirect } from "next/navigation";

export default function RootPage() {
  // Quem acessar a raiz (/) será redirecionado para a página de escalas
  redirect("/escalas");
}