import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Cria a resposta inicial
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 1. Procura as variáveis com e sem o prefixo NEXT_PUBLIC_
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  // 2. Se as variáveis falharem no Vercel, evita crashar a aplicação com Erro 500
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("⚠️ [Middleware] Variáveis de ambiente do Supabase não configuradas no Vercel.")
    return response
  }

  // 3. Inicializa o cliente Supabase compatível com o Edge Runtime
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

  // 4. Obter o utilizador autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 5. Lógica de Verificação de Perfil / Papel do Utilizador
  if (user) {
    // Procura o perfil na base de dados (ajuste 'perfis' para o nome da sua tabela, ex: 'usuarios')
    const { data: usuario } = await supabase
      .from('perfis') 
      .select('papel')
      .eq('id', user.id)
      .single()

    // Se estiver a tentar aceder a áreas restritas de admin e NÃO for super_admin
    if (pathname.startsWith('/admin') && usuario?.papel !== "super_admin") {
      const url = request.nextUrl.clone()
      url.pathname = "/escalas"
      return NextResponse.redirect(url)
    }
  }

  return response
}

// Configuração de rotas onde o middleware deve ser executado
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}