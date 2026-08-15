import Link from "next/link";
import { Wallet } from "lucide-react";

export function BannerPagamento() {
  return (
    <Link
      href="/pagamentos"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-[#E8A33D]/25 bg-[#E8A33D]/[0.06] p-4 transition hover:bg-[#E8A33D]/[0.1]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8A33D]/15">
        <Wallet className="h-4 w-4 text-[#E8A33D]" />
      </div>
      <p className="text-sm font-medium text-[#E8A33D]">
        Hoje é dia de folha de pagamento — clique aqui pra revisar os pagamentos pendentes
      </p>
    </Link>
  );
}