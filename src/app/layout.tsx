import "./globals.css";

export const metadata = {
  title: "SaaS Restaurante - Gestão de Escalas",
  description: "Sistema de gerenciamento de escalas para restaurantes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}