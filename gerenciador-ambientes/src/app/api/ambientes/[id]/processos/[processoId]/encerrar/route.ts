import { NextResponse } from "next/server";
import { ambienteParaFront, buscarAmbiente, sincronizar } from "@/lib/ambientes";
import { encerrarProcesso } from "@/lib/execucao";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

//o que o Next entrega a esta função: os dois ids vêm do endereço
//(/api/ambientes/<id>/processos/<processoId>/encerrar)
interface Contexto {
  params: Promise<{ id: string; processoId: string }>;
}

//encerra um processo do ambiente (os outros continuam rodando)
export async function POST(_req: Request, contexto: Contexto) {
  const { id, processoId } = await contexto.params;

  const ambiente = await buscarAmbiente(id);

  if (!ambiente) {
    return erro("Ambiente não encontrado.", 404);
  }

  //procura o processo dentro do ambiente: assim um id de processo de outro ambiente não é aceito
  const processo = ambiente.processos.find((p) => p.id === processoId);

  if (!processo) {
    return erro("Processo não encontrado.", 404);
  }

  //só manda encerrar se ainda está rodando; se já tinha terminado, não há nada a fazer
  if (processo.status === "executando") {
    try {
      await encerrarProcesso(ambiente.nome, processo.id);
    } catch (e) {
      return erro(`Não foi possível encerrar o processo: ${(e as Error).message}`, 500);
    }
  }

  //confere no Linux como ficou e grava no banco (se foi o último, libera o cgroup e o namespace)
  const atualizado = await sincronizar(ambiente);

  return NextResponse.json(ambienteParaFront(atualizado));
}