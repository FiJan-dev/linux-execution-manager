import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { arquivoDeLog, pastaDeLogs, pastaDoAmbiente, pastaScripts } from "@/lib/caminhos";
import type { Status } from "@/lib/types";

//o que o Linux (ou a execução falsa) informa sobre cada processo
export interface EstadoProcesso {
  idProcesso: string;
  pid: number;
  status: Status;
  codigoSaida?: number;
}

//mesma regra do formulário: minúsculas, números e hífen
const NOME_AMBIENTE = /^[a-z0-9][a-z0-9-]{1,30}$/;

//formato de um id (uuid): só letras de a a f, números e hífen
const ID_PROCESSO = /^[0-9a-f-]{36}$/;

//quanto tempo um processo "dura" na execução falsa, em milissegundos
const DURACAO_FALSA_MS = 30000;

//true = execução falsa (PC, que não tem cgroup nem namespace)
function execucaoFalsa(): boolean {
  return process.env.EXECUCAO_FALSA === "true";
}

//o nome vai para um script que roda como root, então é conferido de novo aqui
function conferirAmbiente(nome: string) {
  if (!NOME_AMBIENTE.test(nome)) {
    throw new Error("Nome de ambiente inválido.");
  }
}

function conferirProcesso(idProcesso: string) {
  if (!ID_PROCESSO.test(idProcesso)) {
    throw new Error("Id de processo inválido.");
  }
}

//o script a executar precisa estar dentro da pasta dos scripts enviados
function conferirCaminho(caminhoScript: string) {
  const pasta = pastaScripts() + path.sep;

  if (!caminhoScript.startsWith(pasta)) {
    throw new Error("Caminho de script inválido.");
  }
}

// ---------------------------------------------------------------- execução real (VM)

//transforma execFile (que usa callback) em uma função que funciona com await
const rodar = promisify(execFile);

//chama o script de execução como root (via sudo) e devolve o JSON que ele imprimiu
//os argumentos vão em uma lista, nunca juntos num texto: não passam por um shell
async function chamarScript(comando: string, argumentos: string[]): Promise<unknown> {
  let script = process.env.LEM_SCRIPT;

  if (!script) {
    script = "/opt/lem/ambiente.sh";
  }

  try {
    //-n: se o sudo pedisse senha, falha na hora em vez de ficar esperando para sempre
    const resultado = await rodar("sudo", ["-n", script, comando, ...argumentos], { timeout: 30000 });

    return JSON.parse(resultado.stdout);
  } catch (e) {
    const falha = e as { stderr?: string; message: string };

    let detalhe = falha.message;

    if (falha.stderr) {
      detalhe = falha.stderr;
    }

    throw new Error(`Falha no comando "${comando}": ${detalhe}`);
  }
}

// ---------------------------------------------------------------- execução falsa (PC)

//o que a execução falsa sabe de cada processo
interface ProcessoFalso {
  pid: number;
  iniciadoEm: number; //horário em que "começou", em milissegundos
  codigoSaida?: number; //só existe depois que "terminou"
}

//formato do lugar global onde a memória falsa é guardada
interface GlobalComFalso {
  lemFalso?: Map<string, Map<string, ProcessoFalso>>;
}

//o global sobrevive quando o Next recarrega o código em desenvolvimento (igual ao lib/prisma.ts)
const lugarGlobal = globalThis as unknown as GlobalComFalso;

let memoria = lugarGlobal.lemFalso;

if (!memoria) {
  memoria = new Map();
  lugarGlobal.lemFalso = memoria;
}

//ambiente -> (id do processo -> dados do processo)
const falso = memoria;

function criarFalso(nome: string) {
  if (!falso.has(nome)) {
    falso.set(nome, new Map());
  }
}

//"executa": inventa um PID e grava um log de exemplo para a rota de log ter o que ler
async function executarFalso(ambiente: string, idProcesso: string): Promise<number> {
  criarFalso(ambiente);

  const pid = 4000 + Math.floor(Math.random() * 5000);

  falso.get(ambiente)?.set(idProcesso, { pid, iniciadoEm: Date.now() });

  const linhas: string[] = [];

  for (let i = 1; i <= 5; i++) {
    linhas.push(`[${new Date().toISOString()}] linha de exemplo ${i} (execução falsa)`);
  }

  await mkdir(pastaDeLogs(ambiente), { recursive: true });
  await writeFile(arquivoDeLog(ambiente, idProcesso), linhas.join("\n") + "\n", "utf8");

  return pid;
}

//informa o estado de cada processo: passados 30s, o processo "termina" sozinho com código 0
function consultarFalso(ambiente: string): EstadoProcesso[] {
  const processos = falso.get(ambiente);

  if (!processos) {
    return [];
  }

  const lista: EstadoProcesso[] = [];

  for (const [idProcesso, p] of processos) {
    const passou = Date.now() - p.iniciadoEm;

    if (p.codigoSaida === undefined && passou > DURACAO_FALSA_MS) {
      p.codigoSaida = 0;
    }

    //ainda sem código de saída: continua rodando
    if (p.codigoSaida === undefined) {
      lista.push({ idProcesso, pid: p.pid, status: "executando" });
      continue;
    }

    //código 0 (acabou bem) e 143 (encerrado pelo usuário) contam como terminado; o resto é erro
    let status: Status = "erro";

    if (p.codigoSaida === 0 || p.codigoSaida === 143) {
      status = "terminado";
    }

    lista.push({ idProcesso, pid: p.pid, status, codigoSaida: p.codigoSaida });
  }

  return lista;
}

function encerrarFalso(ambiente: string, idProcesso: string) {
  const p = falso.get(ambiente)?.get(idProcesso);

  if (p && p.codigoSaida === undefined) {
    p.codigoSaida = 143;
  }
}

async function removerFalso(ambiente: string) {
  falso.delete(ambiente);
  await rm(pastaDoAmbiente(ambiente), { recursive: true, force: true });
}

// ---------------------------------------------------------------- o que as rotas usam

//cria o cgroup e o namespace do ambiente (ainda sem rodar nada)
export async function criarAmbiente(
  nome: string,
  cpu: number,
  memoriaMb: number,
  ioMbps: number,
): Promise<void> {
  conferirAmbiente(nome);

  if (execucaoFalsa()) {
    criarFalso(nome);
    return;
  }

  await chamarScript("criar", [nome, String(cpu), String(memoriaMb), String(ioMbps)]);
}

//roda um script dentro do ambiente e devolve o PID dele no host
export async function executarScript(
  ambiente: string,
  idProcesso: string,
  caminhoScript: string,
): Promise<number> {
  conferirAmbiente(ambiente);
  conferirProcesso(idProcesso);
  conferirCaminho(caminhoScript);

  if (execucaoFalsa()) {
    return executarFalso(ambiente, idProcesso);
  }

  const resposta = (await chamarScript("executar", [ambiente, idProcesso, caminhoScript])) as { pid: number };

  return resposta.pid;
}

//pergunta ao Linux o estado de cada processo do ambiente
export async function consultarProcessos(ambiente: string): Promise<EstadoProcesso[]> {
  conferirAmbiente(ambiente);

  if (execucaoFalsa()) {
    return consultarFalso(ambiente);
  }

  const resposta = await chamarScript("status", [ambiente]);

  return resposta as EstadoProcesso[];
}

//encerra um processo
export async function encerrarProcesso(ambiente: string, idProcesso: string): Promise<void> {
  conferirAmbiente(ambiente);
  conferirProcesso(idProcesso);

  if (execucaoFalsa()) {
    encerrarFalso(ambiente, idProcesso);
    return;
  }

  await chamarScript("encerrar", [ambiente, idProcesso]);
}

//mata tudo do ambiente e apaga o cgroup, o namespace e os arquivos dele
export async function removerAmbiente(ambiente: string): Promise<void> {
  conferirAmbiente(ambiente);

  if (execucaoFalsa()) {
    await removerFalso(ambiente);
    return;
  }

  await chamarScript("remover", [ambiente]);
}

//libera o cgroup e o namespace de um ambiente cujos processos já terminaram
//diferente de removerAmbiente, os logs ficam, para a tela continuar mostrando a saída
export async function liberarAmbiente(ambiente: string): Promise<void> {
  conferirAmbiente(ambiente);

  if (execucaoFalsa()) {
    return;
  }

  await chamarScript("limpar", [ambiente]);
}