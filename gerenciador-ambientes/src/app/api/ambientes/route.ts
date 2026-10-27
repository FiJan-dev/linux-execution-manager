import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  ambienteParaFront,
  buscarAmbiente,
  comandoDoScript,
  listarAmbientes,
  sincronizar,
} from "@/lib/ambientes";
import { arquivoDoScript } from "@/lib/caminhos";
import { criarAmbiente, executarScript, removerAmbiente } from "@/lib/execucao";
import { erro } from "@/lib/http";
import { LIMITES } from "@/lib/limites";
import { prisma } from "@/lib/prisma";
import type { NovoAmbiente } from "@/lib/types";

//o status muda sozinho (os processos terminam), então a resposta nunca pode ser guardada em cache
export const dynamic = "force-dynamic";

//mesma regra do formulário: de 2 a 31 caracteres, minúsculas, números e hífen (sem começar com hífen)
const NOME_AMBIENTE = /^[a-z0-9][a-z0-9-]{1,30}$/;

//true se o valor é um número dentro dos limites (o "valor is number" faz o TypeScript tratar como número depois do teste)
function dentroDoLimite(valor: unknown, min: number, max: number): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= min && valor <= max;
}

//lista os ambientes, já com o status de cada um
export async function GET() {
  const ambientes = await listarAmbientes();

  //confere no Linux os que ainda têm processo rodando (todos ao mesmo tempo)
  const atualizados = await Promise.all(ambientes.map(sincronizar));

  return NextResponse.json(atualizados.map(ambienteParaFront));
}

//cria um ambiente e executa os scripts escolhidos, um processo para cada um
export async function POST(req: Request) {
  let corpo: Partial<NovoAmbiente>;

  try {
    corpo = (await req.json()) as Partial<NovoAmbiente>;
  } catch {
    return erro("Corpo inválido: envie JSON.", 400);
  }

  //o servidor confere de novo tudo que o front já conferiu (o front pode ser burlado)
  const nome = String(corpo.nome ?? "").trim().toLowerCase();

  if (!NOME_AMBIENTE.test(nome)) {
    return erro("Nome inválido: use de 2 a 31 caracteres (letras minúsculas, números e hífen).", 400);
  }

  const { cpu, memoriaMb, ioMbps } = corpo;

  if (!dentroDoLimite(cpu, LIMITES.cpu.min, LIMITES.cpu.max)) {
    return erro(`CPU deve estar entre ${LIMITES.cpu.min} e ${LIMITES.cpu.max}.`, 400);
  }

  if (!dentroDoLimite(memoriaMb, LIMITES.memoriaMb.min, LIMITES.memoriaMb.max) || !Number.isInteger(memoriaMb)) {
    return erro(`Memória deve ser um número inteiro de MB entre ${LIMITES.memoriaMb.min} e ${LIMITES.memoriaMb.max}.`, 400);
  }

  if (!dentroDoLimite(ioMbps, LIMITES.ioMbps.min, LIMITES.ioMbps.max) || !Number.isInteger(ioMbps)) {
    return erro(`IO deve ser um número inteiro de MB/s entre ${LIMITES.ioMbps.min} e ${LIMITES.ioMbps.max}.`, 400);
  }

  const ids = corpo.scriptIds;

  if (!Array.isArray(ids) || ids.length === 0) {
    return erro("Selecione ao menos um script.", 400);
  }

  if (ids.length > LIMITES.maxProgramas) {
    return erro(`No máximo ${LIMITES.maxProgramas} scripts por ambiente.`, 400);
  }

  if (!ids.every((id) => typeof id === "string")) {
    return erro("Lista de scripts inválida.", 400);
  }

  const idsScript = ids as string[];

  if (new Set(idsScript).size !== idsScript.length) {
    return erro("Há scripts repetidos na seleção.", 400);
  }

  //não pode haver dois ambientes com o mesmo nome
  const jaExiste = await prisma.ambiente.findUnique({ where: { nome } });

  if (jaExiste) {
    return erro("Já existe um ambiente com esse nome.", 409);
  }

  //busca os scripts escolhidos; se algum não existir mais, avisa
  const encontrados = await prisma.script.findMany({
    where: { id: { in: idsScript } },
    select: { id: true, nome: true },
  });

  if (encontrados.length !== idsScript.length) {
    return erro("Algum dos scripts escolhidos não existe mais.", 400);
  }

  //grava o ambiente no banco (os processos entram depois, quando cada script começar)
  const ambiente = await prisma.ambiente.create({
    data: { nome, namespace: `lem-${nome}`, cpu, memoriaMb, ioMbps },
  });

  try {
    //cria o cgroup e o namespace, e depois roda os scripts na ordem em que foram escolhidos
    await criarAmbiente(nome, cpu, memoriaMb, ioMbps);

    for (const id of idsScript) {
      const script = encontrados.find((s) => s.id === id);

      if (!script) {
        throw new Error("Script não encontrado.");
      }

      //o id do processo é criado aqui porque o script de execução usa ele para nomear o log
      const idProcesso = randomUUID();
      const extensao = path.extname(script.nome).toLowerCase();
      const pid = await executarScript(nome, idProcesso, arquivoDoScript(script.id, extensao));

      await prisma.processo.create({
        data: {
          id: idProcesso,
          ambienteId: ambiente.id,
          scriptId: script.id,
          comando: comandoDoScript(script.nome),
          pid,
          status: "executando",
        },
      });
    }
  } catch (e) {
    //se algo falhou no meio, desfaz tudo (mata o que já começou e apaga o registro) para não sobrar ambiente pela metade
    try {
      await removerAmbiente(nome);
    } catch (limpeza) {
      console.error(`Não foi possível desfazer o ambiente ${nome}:`, limpeza);
    }

    await prisma.ambiente.delete({ where: { id: ambiente.id } });

    return erro(`Não foi possível criar o ambiente: ${(e as Error).message}`, 500);
  }

  const criado = await buscarAmbiente(ambiente.id);

  if (!criado) {
    return erro("Ambiente criado, mas não encontrado em seguida.", 500);
  }

  return NextResponse.json(ambienteParaFront(criado), { status: 201 });
}