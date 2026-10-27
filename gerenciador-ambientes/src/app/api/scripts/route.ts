import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { arquivoDoScript, pastaScripts } from "@/lib/caminhos";
import { erro } from "@/lib/http";
import { LIMITES } from "@/lib/limites";
import { prisma } from "@/lib/prisma";

//a lista muda a cada envio, então nunca pode ser guardada em cache
export const dynamic = "force-dynamic";

//letras, números, ponto, hífen e sublinhado (sem espaço e sem barra)
const NOME_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

//só estes tipos de arquivo são aceitos
const EXTENSOES = [".sh", ".py"];

//lista os scripts (sem o conteúdo, que é grande)
export async function GET() {
  const scripts = await prisma.script.findMany({
    select: { id: true, nome: true, tamanhoBytes: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json(scripts);
}

//recebe um script enviado pelo formulário (multipart, campo "arquivo")
export async function POST(req: Request) {
  //lê o formulário; se o corpo não for um formulário, avisa em vez de dar erro 500
  let dados: FormData;

  try {
    dados = await req.formData();
  } catch {
    return erro("Envie o arquivo por formulário (multipart).", 400);
  }

  const arquivo = dados.get("arquivo");

  if (!(arquivo instanceof File)) {
    return erro('Envie um arquivo no campo "arquivo".', 400);
  }

  const nome = arquivo.name;
  const extensao = path.extname(nome).toLowerCase();

  //o servidor confere de novo tudo que o front já conferiu (o front pode ser burlado)
  if (!EXTENSOES.includes(extensao)) {
    return erro("Só são aceitos arquivos .sh e .py.", 400);
  }

  if (!NOME_VALIDO.test(nome)) {
    return erro("Nome inválido: use letras, números, ponto, hífen e sublinhado (sem espaços).", 400);
  }

  if (arquivo.size === 0) {
    return erro("O arquivo está vazio.", 400);
  }

  if (arquivo.size > LIMITES.maxScriptBytes) {
    return erro("O arquivo passa de 1 MB.", 400);
  }

  //troca o fim de linha do Windows (\r\n) pelo do Linux (\n)
  //um .sh salvo no Windows com \r\n quebra no bash ("\r: command not found")
  const texto = (await arquivo.text()).replace(/\r\n/g, "\n");

  //checagem simples para rejeitar um executável disfarçado de .py 
  if (texto.includes("\0")) {
    return erro("O arquivo não parece ser texto.", 400);
  }

  //não pode haver dois scripts com o mesmo nome
  const jaExiste = await prisma.script.findUnique({ where: { nome } });

  if (jaExiste) {
    return erro(`Já existe um script chamado "${nome}".`, 409);
  }

  //grava no banco
  const criado = await prisma.script.create({
    data: { nome, tamanhoBytes: Buffer.byteLength(texto, "utf8"), conteudo: texto },
    select: { id: true, nome: true, tamanhoBytes: true, criadoEm: true },
  });

  //grava também em disco, porque é o arquivo em disco que será executado
  try {
    await mkdir(pastaScripts(), { recursive: true });
    await writeFile(arquivoDoScript(criado.id, extensao), texto, "utf8");
  } catch {
    //se não conseguiu gravar em disco, desfaz o registro para banco e disco não ficarem diferentes
    await prisma.script.delete({ where: { id: criado.id } });
    return erro("Não foi possível gravar o script no disco.", 500);
  }

  return NextResponse.json(criado, { status: 201 });
}