import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Faz o refresh do token de sessão do Supabase a cada requisição.
 * Sem isso, `createClient()` de src/lib/supabase/server.ts não consegue
 * gravar cookies em Server Components (só o proxy pode), então o
 * access token expira (~1h) e o usuário some/deloga sem aviso mesmo
 * com um refresh token válido. Ver comentário em lib/supabase/server.ts.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Só isso já dispara o refresh (getUser valida/renova o token via cookies).
  // A checagem de autorização por rota continua nas Server Actions/páginas
  // (requireGerente/requireSuperAdmin em src/lib/auth/permissions.ts).
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
