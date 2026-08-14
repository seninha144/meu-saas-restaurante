import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 📷 IMAGENS - Supabase Storage para fotos de pratos/restaurantes
  images: {
    domains: [
      "localhost",
      "127.0.0.1",
      "berejtwfaxuiompzljjm.supabase.co",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "berejtwfaxuiompzljjm.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // 🔐 HEADERS DE SEGURANÇA - Proteção contra ataques
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
  ],

  // ✅ ENV PÚBLICAS - Supabase
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  },
};

export default nextConfig;