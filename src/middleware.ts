import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rotas de API se autenticam sozinhas (ex: bearer token do cron) —
  // nunca devem passar pela checagem de sessão/cookie abaixo, senão
  // o middleware redireciona a requisição pro /login e ela nunca
  // chega no Route Handler. Esse era o motivo do cron nunca rodar.
  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

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

  // Únicas rotas acessíveis SEM sessão. Tudo que precisa de sessão mas
  // não de assinatura ativa (onboarding, bloqueio) fica de fora dessa
  // lista de propósito — precisa estar logado pra chegar lá, só não
  // precisa ter completado onboarding/pagamento ainda.
  const rotaPublica = path === "/login" || path === "/registro";

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