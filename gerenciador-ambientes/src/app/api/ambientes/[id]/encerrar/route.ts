import { NextResponse } from "next/server";
import { ambienteParaFront, buscarAmbiente, sincronizar } from "@/lib/ambientes";
import { encerrarProcesso } from "@/lib/execucao";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

//o que o Next entrega a esta função: o id vem do endereço (/api/ambientes/<id>/encerrar)
interface Contexto {
  params: Promise<{ id: string }>;
}

//encerra todos os processos que ainda estão rodando no ambiente (o ambiente continua existindo)
export async function POST(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  const ambiente = await buscarAmbiente(id);

  if (!ambiente) {
    return erro("Ambiente não encontrado.", 404);
  }

  //só os que o banco ainda marca como em execução precisam ser encerrados
  const rodando = ambiente.processos.filter((p) => p.status === "executando");

  let primeiraFalha: string | null = null;

  //tenta encerrar todos, mesmo que um falhe, para não deixar os outros rodando
  for (const p of rodando) {
    try {
      await encerrarProcesso(ambiente.nome, p.id);
    } catch (e) {
      if (primeiraFalha === null) {
        primeiraFalha = (e as Error).message;
      }
    }
  }

  //confere no Linux como ficou e grava no banco (se não sobrou nenhum rodando, libera o cgroup e o namespace)
  const atualizado = await sincronizar(ambiente);

  if (primeiraFalha !== null) {
    return erro(`Nem todos os processos foram encerrados: ${primeiraFalha}`, 500);
  }

  return NextResponse.json(ambienteParaFront(atualizado));
}