import { NextResponse } from "next/server";
import { ambienteParaFront, buscarAmbiente, sincronizar } from "@/lib/ambientes";
import { removerAmbiente } from "@/lib/execucao";
import { erro } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

//o que o Next entrega a estas funções: o id vem do endereço (/api/ambientes/<id>)
interface Contexto {
  params: Promise<{ id: string }>;
}

//devolve um ambiente com os processos e o status atualizado
export async function GET(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  const ambiente = await buscarAmbiente(id);

  if (!ambiente) {
    return erro("Ambiente não encontrado.", 404);
  }

  //confere no Linux os processos que ainda estão rodando e grava o que mudou
  const atualizado = await sincronizar(ambiente);

  return NextResponse.json(ambienteParaFront(atualizado));
}

//encerra tudo, apaga o ambiente do Linux (cgroup, namespace e arquivos) e depois do banco
export async function DELETE(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  const ambiente = await buscarAmbiente(id);

  if (!ambiente) {
    return erro("Ambiente não encontrado.", 404);
  }

  //primeiro o Linux: se falhar, o registro continua no banco e dá para tentar remover de novo
  try {
    await removerAmbiente(ambiente.nome);
  } catch (e) {
    return erro(`Não foi possível remover o ambiente: ${(e as Error).message}`, 500);
  }

  //os processos do ambiente são apagados junto (onDelete: Cascade no schema)
  await prisma.ambiente.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}