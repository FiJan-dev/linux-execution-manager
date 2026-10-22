import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/NavLink";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gerenciador de Ambientes",
  description: "Crie e gerencie ambientes isolados (namespaces e cgroups) para executar programas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">Gerenciador de Ambientes</Link>
            <nav className="nav">
              <NavLink href="/">Ambientes</NavLink>
              <NavLink href="/ambientes/novo">Novo ambiente</NavLink>
              <NavLink href="/scripts">Scripts</NavLink>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
