"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

//link do menu do topo que se destaca quando o usuário está naquela página
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const ativo =
    href === "/"
      ? pathname === "/" ||
        (pathname.startsWith("/ambientes/") && pathname !== "/ambientes/novo")
      : pathname === href;
  return (
    <Link href={href} className={ativo ? "nav-link ativo" : "nav-link"}>
      {children}
    </Link>
  );
}
