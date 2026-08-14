import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database.types'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 1. Procura as variáveis com e sem o prefixo NEXT_PUBLIC_
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 2. Se as variáveis falharem, evita crashar com Erro 500
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ [Middleware] Variáveis de ambiente do Supabase não configuradas.')
    return response
  }

  // 3. Inicializa o cliente Supabase com tipagem correta
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        response = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
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
    try {
      // Procura o perfil na base de dados
      const { data: usuario, error } = await supabase
        .from('perfis')
        .select('papel')
        .eq('id', user.id)
        .single()

      // Se houve erro ou usuário não existe
      if (error || !usuario) {
        console.warn(`⚠️ [Middleware] Perfil não encontrado para user ${user.id}`)
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }

      // Se estiver a tentar aceder a /admin e NÃO for super_admin
      if (pathname.startsWith('/admin')) {
        if (usuario.papel !== 'super_admin') {
          const url = request.nextUrl.clone()
          url.pathname = '/escalas'
          return NextResponse.redirect(url)
        }
      }

      // Se estiver em /super-admin mas não for super_admin
      if (pathname.startsWith('/(super-admin)')) {
        if (usuario.papel !== 'super_admin') {
          const url = request.nextUrl.clone()
          url.pathname = '/escalas'
          return NextResponse.redirect(url)
        }
      }
    } catch (error) {
      console.error('❌ [Middleware] Erro ao verificar perfil:', error)
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  } else {
    // Se não estiver autenticado e tentar acessar área protegida
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/(super-admin)')
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return response
}

// Configuração de rotas onde o middleware deve ser executado
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}