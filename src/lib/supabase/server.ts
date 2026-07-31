import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
 
/**
 * Cliente Supabase para Server Components, Route Handlers e Server
 * Actions. Lê/escreve a sessão via cookies — é o que faz o RLS
 * funcionar corretamente com `auth.uid()` do usuário logado.
 *
 * IMPORTANTE: nunca reutilize o client do browser (client.ts) no
 * servidor, nem este aqui no browser — a causa nº1 de "RLS bloqueando
 * tudo" em projetos Supabase + Next.js é misturar os dois.
 */
export async function createClient() {
  const cookieStore = await cookies();
 
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chamado a partir de um Server Component (sem permissão de
            // escrita) — ok ignorar, o middleware cuida do refresh de sessão.
          }
        },
      },
    }
  );
}
 