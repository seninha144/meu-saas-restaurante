import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 🟢 TEMPORÁRIO: Libera o acesso a TODAS as rotas sem precisar de login para facilitar o desenvolvimento
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}