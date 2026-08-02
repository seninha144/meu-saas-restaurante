import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Protegido por um header, não por sessão de usuário — quem chama é o
 * agendador (Vercel Cron, ou qualquer scheduler externo), não uma
 * pessoa logada. Configure em vercel.json:
 *   { "crons": [{ "path": "/api/cron/expirar-trials", "schedule": "0 3 * * *" }] }
 * e defina CRON_SECRET no .env — a Vercel injeta esse header
 * automaticamente em crons configurados dessa forma.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("restaurantes")
    .update({ status_assinatura: "canceled" })
    .eq("status_assinatura", "trial")
    .lt("trial_ends_at", new Date().toISOString())
    .select("id");

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ restaurantesExpirados: data?.length ?? 0 });
}