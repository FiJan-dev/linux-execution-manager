import { createReadStream } from "node:fs";
import { open, stat, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { buscarAmbiente, sincronizar } from "@/lib/ambientes";
import { arquivoDeLog } from "@/lib/caminhos";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

//quantas linhas devolver quando o front não pede, e o máximo que aceitamos
const LINHAS_PADRAO = 300;
const LINHAS_MAXIMAS = 2000;

//quanto do final do arquivo é lido, no máximo (256 KB): o log pode ter muitos MB, e só o fim interessa
const BYTES_DO_FINAL = 256 * 1024;

//o que o Next entrega a esta função: os dois ids vêm do endereço
//(/api/ambientes/<id>/processos/<processoId>/log)
interface Contexto {
  params: Promise<{ id: string; processoId: string }>;
}

//transforma o ?linhas=... do endereço em um número válido (qualquer coisa estranha vira o padrão)
function quantasLinhas(texto: string | null): number {
  const n = Number(texto);

  if (!Number.isInteger(n) || n < 1) {
    return LINHAS_PADRAO;
  }

  return Math.min(n, LINHAS_MAXIMAS);
}

//lê só o final do arquivo e devolve as últimas linhas (sem carregar o arquivo inteiro na memória)
//se o arquivo ainda não existe, devolve uma lista vazia
async function lerFinal(arquivo: string, linhasDesejadas: number): Promise<string[]> {
  let aberto: FileHandle;

  try {
    aberto = await open(arquivo, "r");
  } catch {
    return [];
  }

  try {
    const { size } = await aberto.stat();

    //lê no máximo os últimos 256 KB (ou o arquivo todo, se for menor)
    const tamanho = Math.min(size, BYTES_DO_FINAL);
    const buffer = Buffer.alloc(tamanho);

    //o último argumento é de onde começar a ler: size - tamanho = o começo do trecho final
    await aberto.read(buffer, 0, tamanho, size - tamanho);

    const linhas = buffer.toString("utf8").split("\n");

    //se a leitura começou no meio do arquivo, a primeira linha está cortada: descarta
    if (size > tamanho) {
      linhas.shift();
    }

    //o texto termina com \n, então o split deixa uma última linha vazia: descarta
    if (linhas.length > 0 && linhas[linhas.length - 1] === "") {
      linhas.pop();
    }

    return linhas.slice(-linhasDesejadas);
  } finally {
    //fecha o arquivo mesmo se a leitura der erro
    await aberto.close();
  }
}

//devolve o arquivo de log inteiro para o navegador baixar
//usa um fluxo (stream): o arquivo vai saindo aos poucos, sem ser carregado todo na memória
async function baixar(arquivo: string, nomeDoDownload: string): Promise<Response> {
  try {
    await stat(arquivo);
  } catch {
    return erro("Log não encontrado.", 404);
  }

  const leitura = createReadStream(arquivo);
  const corpo = Readable.toWeb(leitura) as unknown as ReadableStream;

  return new Response(corpo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeDoDownload}"`,
    },
  });
}

//log de um processo: últimas linhas em JSON, ou o arquivo inteiro com ?formato=txt
export async function GET(req: Request, contexto: Contexto) {
  const { id, processoId } = await contexto.params;

  const ambiente = await buscarAmbiente(id);

  if (!ambiente) {
    return erro("Ambiente não encontrado.", 404);
  }

  //procura o processo dentro do ambiente: um id de processo de outro ambiente não é aceito
  const processo = ambiente.processos.find((p) => p.id === processoId);

  if (!processo) {
    return erro("Processo não encontrado.", 404);
  }

  const arquivo = arquivoDeLog(ambiente.nome, processo.id);
  const parametros = new URL(req.url).searchParams;

  //download do arquivo inteiro
  if (parametros.get("formato") === "txt") {
    return baixar(arquivo, `log-${ambiente.nome}-${processo.pid}.txt`);
  }

  //confere no Linux como estão os processos, para o status que vai junto com o log estar atualizado
  const atualizado = await sincronizar(ambiente);

  let status = processo.status;
  const atual = atualizado.processos.find((p) => p.id === processo.id);

  if (atual) {
    status = atual.status;
  }

  const linhas = await lerFinal(arquivo, quantasLinhas(parametros.get("linhas")));

  return NextResponse.json({ linhas, status });
}