import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'


export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("⚠️ [Middleware] Variáveis de ambiente do Supabase não configuradas no Vercel.")
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // 1. Obter o utilizador autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 2. Definir rotas públicas (onde NINGUÉM precisa de login)
  const ehRotaPublica = 
    pathname === '/login' || 
    pathname === '/registro' || 
    pathname === '/' ||
    pathname.startsWith('/api/')

  // 3. REGRA 1: Se NÃO está logado e tenta acessar área privada -> envia para /login
  if (!user && !ehRotaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 4. REGRA 2: Se JÁ ESTÁ logado e tenta ir para /login ou /registro -> envia para a página inicial do app
  if (user && (pathname === '/login' || pathname === '/registro')) {
    const url = request.nextUrl.clone()
    url.pathname = '/escalas'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.\\.(?:svg|png|jpg|jpeg|gif|webp)$).)",
  ],
}