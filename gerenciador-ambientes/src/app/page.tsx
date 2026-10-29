import Link from "next/link";
import { ListaAmbientes } from "@/components/ListaAmbientes";

export default function Home() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ambientes</h1>
          <p className="sub">Ambientes de execução criados e o status de cada um. Atualiza sozinho.</p>
        </div>
        <Link className="btn btn-primary" href="/ambientes/novo">+ Novo ambiente</Link>
      </div>
      <ListaAmbientes />
    </>
  );
}
