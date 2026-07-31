import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Cliente com a service_role key — BYPASSA todo o RLS.
 *
 * `import "server-only"` garante que, se algum dia esse arquivo for
 * importado por engano num Client Component, o build QUEBRA em vez de
 * vazar a service_role key para o bundle do navegador.
 *
 * Uso exclusivo: Server Actions do Super Admin que precisam criar
 * contas de auth.users para novos Gerentes (a Admin API do Supabase
 * Auth só funciona com a service_role key).
 * NUNCA chame isso a partir de código que roda no client, e NUNCA
 * exponha essa key com o prefixo NEXT_PUBLIC_.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}