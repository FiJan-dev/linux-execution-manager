import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { arquivoDoScript } from "@/lib/caminhos";
import { erro } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

//o que o Next entrega a estas funções: o id vem do endereço (/api/scripts/<id>)
interface Contexto {
  params: Promise<{ id: string }>;
}

//devolve um script com o conteúdo (usado em "Ver conteúdo")
export async function GET(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  const script = await prisma.script.findUnique({ where: { id } });

  if (!script) {
    return erro("Script não encontrado.", 404);
  }

  return NextResponse.json(script);
}

//remove o script do banco e do disco
export async function DELETE(_req: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  const script = await prisma.script.findUnique({ where: { id } });

  if (!script) {
    return erro("Script não encontrado.", 404);
  }

  //quantos processos deste script ainda estão rodando
  const rodando = await prisma.processo.count({
    where: { scriptId: id, status: "executando" },
  });

  //não deixa remover um script em uso: apagar o arquivo no meio da execução pode quebrar o processo
  if (rodando > 0) {
    return erro(`O script está em uso por ${rodando} processo(s) em execução. Encerre-os antes de remover.`, 409);
  }

  //nenhum processo deste script está rodando; os que já terminaram continuam existindo (o scriptId deles vira nulo)
  await prisma.script.delete({ where: { id } });

  //a extensão do nome (.py ou .sh), em minúsculas como foi gravada no upload
  const extensao = path.extname(script.nome).toLowerCase();
  //apaga o arquivo do disco; force: true evita erro se ele já não existir
  await rm(arquivoDoScript(id, extensao), { force: true });

  return NextResponse.json({ ok: true });
}