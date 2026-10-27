import type { Ambiente as AmbienteDoBanco, Processo as ProcessoDoBanco } from "@prisma/client";
import { consultarProcessos, liberarAmbiente } from "@/lib/execucao";
import { prisma } from "@/lib/prisma";
import { statusDoAmbiente } from "@/lib/status";
import type { AmbienteView, Processo } from "@/lib/types";

//um ambiente como vem do banco, já com a lista de processos dele
export type AmbienteComProcessos = AmbienteDoBanco & { processos: ProcessoDoBanco[] };

//como o script é executado (o script de execução faz o mesmo, pela extensão)
export function comandoDoScript(nome: string): string {
  if (nome.endsWith(".py")) {
    return `python3 -u ${nome}`;
  }

  return `bash ${nome}`;
}

//busca um ambiente com os processos (do mais antigo para o mais novo); devolve null se não existir
export async function buscarAmbiente(id: string): Promise<AmbienteComProcessos | null> {
  return prisma.ambiente.findUnique({
    where: { id },
    include: { processos: { orderBy: { iniciadoEm: "asc" } } },
  });
}

//lista os ambientes, do mais novo para o mais antigo
export async function listarAmbientes(): Promise<AmbienteComProcessos[]> {
  return prisma.ambiente.findMany({
    orderBy: { criadoEm: "desc" },
    include: { processos: { orderBy: { iniciadoEm: "asc" } } },
  });
}

//converte uma linha de processo do banco para o formato que o front espera (lib/types.ts)
//datas viram texto, e os campos vazios (null) ficam de fora: o front trata "ausente" e não "null"
function processoParaFront(p: ProcessoDoBanco): Processo {
  const processo: Processo = {
    id: p.id,
    comando: p.comando,
    pid: p.pid,
    status: p.status,
    iniciadoEm: p.iniciadoEm.toISOString(),
  };

  if (p.finalizadoEm) {
    processo.finalizadoEm = p.finalizadoEm.toISOString();
  }

  if (p.codigoSaida !== null) {
    processo.codigoSaida = p.codigoSaida;
  }

  return processo;
}

//converte um ambiente do banco para o formato do front, com o status calculado dos processos
export function ambienteParaFront(a: AmbienteComProcessos): AmbienteView {
  const processos = a.processos.map(processoParaFront);

  return {
    id: a.id,
    nome: a.nome,
    namespace: a.namespace,
    cpu: a.cpu,
    memoriaMb: a.memoriaMb,
    ioMbps: a.ioMbps,
    criadoEm: a.criadoEm.toISOString(),
    processos,
    status: statusDoAmbiente(processos),
  };
}

//pergunta ao Linux como estão os processos que o banco ainda marca como "executando"
//e grava no banco o que mudou (status, código de saída e hora do fim)
//quando o último processo para, libera o cgroup e o namespace (os logs ficam)
export async function sincronizar(ambiente: AmbienteComProcessos): Promise<AmbienteComProcessos> {
  const rodando = ambiente.processos.filter((p) => p.status === "executando");

  //nada para conferir: todos os processos já têm status final no banco
  if (rodando.length === 0) {
    return ambiente;
  }

  let estados;

  try {
    estados = await consultarProcessos(ambiente.nome);
  } catch (e) {
    //se o Linux não responder, a tela continua mostrando o que o banco sabe, em vez de quebrar a lista
    console.error(`Não foi possível consultar o ambiente ${ambiente.nome}:`, e);
    return ambiente;
  }

  //procura o estado de um processo pelo id dele
  const porId = new Map(estados.map((e) => [e.idProcesso, e]));

  let mudou = false;

  for (const p of rodando) {
    const estado = porId.get(p.id);

    //o Linux não conhece mais este processo: sumiu sem deixar código de saída, conta como erro
    if (!estado) {
      await prisma.processo.update({
        where: { id: p.id },
        data: { status: "erro", finalizadoEm: new Date() },
      });
      mudou = true;
      continue;
    }

    //continua rodando: nada a gravar
    if (estado.status === "executando") {
      continue;
    }

    let codigo: number | null = null;

    if (estado.codigoSaida !== undefined) {
      codigo = estado.codigoSaida;
    }

    await prisma.processo.update({
      where: { id: p.id },
      data: { status: estado.status, codigoSaida: codigo, finalizadoEm: new Date() },
    });
    mudou = true;
  }

  if (!mudou) {
    return ambiente;
  }

  //recarrega do banco com os status novos
  const atualizado = await buscarAmbiente(ambiente.id);

  if (!atualizado) {
    return ambiente;
  }

  const aindaRodando = atualizado.processos.some((p) => p.status === "executando");

  //acabou o último processo: libera os recursos do Linux (o cgroup e o namespace)
  if (!aindaRodando) {
    try {
      await liberarAmbiente(atualizado.nome);
    } catch (e) {
      console.error(`Não foi possível liberar o ambiente ${atualizado.nome}:`, e);
    }
  }

  return atualizado;
}