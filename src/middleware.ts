import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Roda em toda requisição (exceto assets estáticos, ver `config.matcher`).
 * Duas responsabilidades:
 * 1. Refrescar o token de sessão do Supabase (senão a sessão expira em
 *    componentes de servidor mesmo com o usuário ativo no navegador).
 * 2. Redirecionar por papel: visitante sem sessão -> /login; gerente
 *    tentando entrar em /gerentes (área do super_admin) -> bloqueado.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const rotaPublica = path === "/login";

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/gerentes")) {
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("papel")
      .eq("id", user.id)
      .single();

    if (usuario?.papel !== "super_admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/escalas";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};