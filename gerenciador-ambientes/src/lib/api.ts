//ÚNICO PONTO DE CONTATO DO FRONT COM OS DADOS
//todo componente chama api("/api/...") e recebe a resposta
//hoje, com USAR_MOCK = true, as respostas vêm de dados de exemplo guardados na memória deste arquivo (somem ao recarregar a página)
//quando o back existir, basta trocar para false: as chamadas passam a ir para o servidor de verdade e nenhum componente precisa mudar

import type {
  Ambiente,
  AmbienteView,
  LogResposta,
  NovoAmbiente,
  Processo,
  Script,
  ScriptResumo,
  Status,
} from "./types";
import { LIMITES } from "./limites";

//true = usa os dados de exemplo deste arquivo, false = chama o servidor de verdade
const USAR_MOCK = true;

//função que todos os componentes usam para buscar ou enviar dados
//url é o endereço (ex.: "/api/ambientes"), init é o resto do pedido (método, corpo...)
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  if (USAR_MOCK) {
    await new Promise((r) => setTimeout(r, 150)); //simula a demora da rede
    return (await rotear(url, init)) as T;
  }

  return chamarServidor<T>(url, init);
}

//chamada real ao servidor (usada quando USAR_MOCK = false)
async function chamarServidor<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init }); //no-store: nunca usa resposta guardada, sempre busca de novo
  const data: unknown = await r.json().catch(() => ({})); //se a resposta não for JSON, usa um objeto vazio

  if (!r.ok) {
    //o servidor devolve os erros no formato { erro: "mensagem" }
    const msg = (data as { erro?: string }).erro;
    throw new Error(msg ?? `Erro ${r.status}`);
  }

  return data as T;
}

// ---------------------------------------------------------------- dados de exemplo

const agora = Date.now();

//data de X minutos atrás, no formato ISO (60_000 = 60000, o _ só facilita a leitura)
const minutosAtras = (m: number) => new Date(agora - m * 60_000).toISOString();

//tamanho de um texto em bytes (letras com acento ocupam mais de 1 byte)
const tamanho = (texto: string) => new TextEncoder().encode(texto).length;

//como cada tipo de script é executado (o back faz o mesmo, pela extensão)
function comandoDoScript(nome: string): string {
  if (nome.endsWith(".py")) {
    return `python3 -u scripts/${nome}`;
  }

  return `bash scripts/${nome}`;
}

function novoScript(id: string, nome: string, minutos: number, conteudo: string): Script {
  return { id, nome, tamanhoBytes: tamanho(conteudo), criadoEm: minutosAtras(minutos), conteudo };
}

//contadores para criar ids e PIDs novos (o back real usa o banco e o Linux para isso)
let proximoId = 100;
let proximoPid = 4300;

//scripts de exemplo
let scripts: Script[] = [
  novoScript("s1", "monitor.py", 120, "import time\nwhile True:\n    print('serviço rodando', flush=True)\n    time.sleep(2)\n"),
  novoScript("s2", "carga.sh", 90, "#!/bin/bash\n# gera carga de CPU\nwhile true; do :; done\n"),
  novoScript("s3", "backup.sh", 60, "#!/bin/bash\ntar -czf /tmp/backup.tgz /etc\necho 'backup concluído'\n"),
  novoScript("s4", "erro.py", 30, "import sys\nprint('algo deu errado')\nsys.exit(1)\n"),
];

//ambientes de exemplo (um de cada status: em execução, terminado e erro)
let ambientes: Ambiente[] = [
  {
    id: "1",
    nome: "web-demo",
    namespace: "lem-web-demo",
    cpu: 0.5,
    memoriaMb: 256,
    ioMbps: 50,
    criadoEm: minutosAtras(25),
    processos: [
      { id: "1a", comando: comandoDoScript("monitor.py"), pid: 4200, status: "executando", iniciadoEm: minutosAtras(25) },
      { id: "1b", comando: comandoDoScript("backup.sh"), pid: 4201, status: "terminado", iniciadoEm: minutosAtras(25), finalizadoEm: minutosAtras(24), codigoSaida: 0 },
    ],
  },
  {
    id: "2",
    nome: "carga-cpu",
    namespace: "lem-carga-cpu",
    cpu: 1,
    memoriaMb: 512,
    ioMbps: 20,
    criadoEm: minutosAtras(8),
    processos: [
      { id: "2a", comando: comandoDoScript("carga.sh"), pid: 4210, status: "executando", iniciadoEm: minutosAtras(8) },
    ],
  },
  {
    id: "3",
    nome: "backup-noturno",
    namespace: "lem-backup-noturno",
    cpu: 0.2,
    memoriaMb: 128,
    ioMbps: 10,
    criadoEm: minutosAtras(90),
    processos: [
      { id: "3a", comando: comandoDoScript("backup.sh"), pid: 4150, status: "terminado", iniciadoEm: minutosAtras(90), finalizadoEm: minutosAtras(89), codigoSaida: 0 },
    ],
  },
  {
    id: "4",
    nome: "teste-erro",
    namespace: "lem-teste-erro",
    cpu: 0.1,
    memoriaMb: 64,
    ioMbps: 5,
    criadoEm: minutosAtras(40),
    processos: [
      { id: "4a", comando: comandoDoScript("erro.py"), pid: 4180, status: "erro", iniciadoEm: minutosAtras(40), finalizadoEm: minutosAtras(40), codigoSaida: 1 },
    ],
  },
];

// ------------------------------------------------------------------ "servidor" falso
//as funções abaixo fazem o papel do back enquanto ele não existe

//lança um erro com a mensagem (o "never" diz que a função nunca devolve nada, sempre para aqui)
function erro(msg: string): never {
  throw new Error(msg);
}

//status do ambiente a partir dos processos: se algum roda é "executando", senão se algum deu erro é "erro", senão "terminado"
function statusDe(a: Ambiente): Status {
  if (a.processos.some((p) => p.status === "executando")) {
    return "executando";
  }

  if (a.processos.some((p) => p.status === "erro")) {
    return "erro";
  }

  return "terminado";
}

//devolve uma cópia do ambiente com o campo status (structuredClone evita que a tela mexa nos dados originais)
function comStatus(a: Ambiente): AmbienteView {
  return structuredClone({ ...a, status: statusDe(a) });
}

//as funções "achar" procuram pelo id e dão erro se não existir (o ?? só executa o que vem depois se o resultado for vazio)
function acharAmbiente(id: string): Ambiente {
  return ambientes.find((a) => a.id === id) ?? erro("Ambiente não encontrado.");
}

function acharProcesso(a: Ambiente, pid: string): Processo {
  return a.processos.find((p) => p.id === pid) ?? erro("Processo não encontrado.");
}

function acharScript(id: string): Script {
  return scripts.find((s) => s.id === id) ?? erro("Script não encontrado.");
}

//encerra um processo (143 é o código que o Linux usa quando um processo é parado com SIGTERM)
function encerrar(p: Processo) {
  if (p.status !== "executando") {
    return; //já tinha terminado, não faz nada
  }

  p.status = "terminado";
  p.finalizadoEm = new Date().toISOString();
  p.codigoSaida = 143;
}

//script sem o conteúdo, para a lista (o resto do objeto é copiado, o conteudo fica de fora)
function resumo({ conteudo: _conteudo, ...resto }: Script): ScriptResumo {
  return resto;
}

//log de exemplo: um texto fixo com 20 linhas
function logDe(p: Processo): LogResposta {
  const linhas = [`iniciando: ${p.comando} (pid ${p.pid})`];

  for (let i = 1; i <= 20; i++) {
    linhas.push(`saída de exemplo, linha ${i}`);
  }

  if (p.status !== "executando") {
    linhas.push(`processo finalizado com código ${p.codigoSaida ?? 0}`);
  }

  return { linhas, status: p.status };
}

//cria um ambiente novo, com um processo para cada script escolhido
function criarAmbiente(n: NovoAmbiente): AmbienteView {
  const nome = String(n.nome ?? "").trim().toLowerCase();

  //o nome precisa ter de 2 a 31 caracteres: letras minúsculas, números e hífen (sem começar com hífen)
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(nome)) {
    erro("Nome inválido: use de 2 a 31 caracteres (letras minúsculas, números e hífen).");
  }

  if (ambientes.some((a) => a.nome === nome)) {
    erro("Já existe um ambiente com esse nome.");
  }

  const ids = n.scriptIds ?? [];

  if (ids.length === 0) {
    erro("Selecione ao menos um script.");
  }

  if (ids.length > LIMITES.maxProgramas) {
    erro(`No máximo ${LIMITES.maxProgramas} scripts por ambiente.`);
  }

  //para cada id escolhido, busca o script (dá erro se algum não existir)
  const escolhidos = ids.map(acharScript);

  const agoraIso = new Date().toISOString();

  const novo: Ambiente = {
    id: String(proximoId++),
    nome,
    namespace: `lem-${nome}`,
    cpu: n.cpu,
    memoriaMb: n.memoriaMb,
    ioMbps: n.ioMbps,
    criadoEm: agoraIso,
    //um processo para cada script escolhido, todos começam "executando"
    processos: escolhidos.map((s) => ({
      id: String(proximoId++),
      comando: comandoDoScript(s.nome),
      pid: proximoPid++,
      status: "executando" as const,
      iniciadoEm: agoraIso,
    })),
  };

  ambientes.push(novo);

  return comStatus(novo);
}

//guarda um script enviado pelo formulário
async function salvarScript(form: FormData): Promise<ScriptResumo> {
  const arquivo = form.get("arquivo");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    erro("Selecione um arquivo.");
  }

  //só aceita .sh e .py (o i no final ignora maiúsculas, então .PY também vale)
  if (!/\.(sh|py)$/i.test(arquivo.name)) {
    erro("Envie um arquivo .sh (bash) ou .py (python).");
  }

  if (scripts.some((s) => s.nome === arquivo.name)) {
    erro("Já existe um script com esse nome. Remova-o antes de reenviar.");
  }

  const script: Script = {
    id: `s${proximoId++}`,
    nome: arquivo.name,
    tamanhoBytes: arquivo.size,
    criadoEm: new Date().toISOString(),
    conteudo: await arquivo.text(), //lê o texto do arquivo
  };

  scripts.push(script);

  return resumo(script);
}

//faz o papel das rotas /api/...: olha o método e a URL e devolve a resposta
async function rotear(url: string, init?: RequestInit): Promise<unknown> {
  const metodo = init?.method ?? "GET"; //sem método informado, é GET
  const caminho = url.split("?")[0]; //tira a parte depois do ?, ex.: "/api/.../log?linhas=300" vira "/api/.../log"

  //cada linha abaixo testa se o caminho tem aquele formato
  //([^/]+) é o pedaço que muda (o id), e o resultado fica em [1], [2]; se não bater, o valor é null
  const rotaScript = caminho.match(/^\/api\/scripts\/([^/]+)$/);
  const rotaAmbiente = caminho.match(/^\/api\/ambientes\/([^/]+)$/);
  const rotaEncerrarAmbiente = caminho.match(/^\/api\/ambientes\/([^/]+)\/encerrar$/);
  const rotaEncerrarProcesso = caminho.match(/^\/api\/ambientes\/([^/]+)\/processos\/([^/]+)\/encerrar$/);
  const rotaLog = caminho.match(/^\/api\/ambientes\/([^/]+)\/processos\/([^/]+)\/log$/);

  // ---- scripts
  if (caminho === "/api/scripts") {
    if (metodo === "GET") {
      return structuredClone(scripts.map(resumo)).reverse(); //lista (sem o conteúdo), do mais novo para o mais antigo
    }

    if (metodo === "POST") {
      return salvarScript(init?.body as FormData); //upload
    }
  }

  if (rotaScript) {
    const script = acharScript(rotaScript[1]);

    if (metodo === "GET") {
      return structuredClone(script); //script completo, com o conteúdo
    }

    if (metodo === "DELETE") {
      scripts = scripts.filter((s) => s.id !== script.id); //mantém todos menos esse
      return { ok: true };
    }
  }

  // ---- ambientes
  if (caminho === "/api/ambientes") {
    if (metodo === "GET") {
      return ambientes.map(comStatus).reverse(); //lista, do mais novo para o mais antigo
    }

    if (metodo === "POST") {
      return criarAmbiente(JSON.parse(String(init?.body)) as NovoAmbiente); //o corpo chega como texto, JSON.parse transforma em objeto
    }
  }

  if (rotaAmbiente) {
    const ambiente = acharAmbiente(rotaAmbiente[1]);

    if (metodo === "GET") {
      return comStatus(ambiente);
    }

    if (metodo === "DELETE") {
      ambientes = ambientes.filter((a) => a.id !== ambiente.id);
      return { ok: true };
    }
  }

  //encerra todos os processos do ambiente
  if (rotaEncerrarAmbiente && metodo === "POST") {
    const ambiente = acharAmbiente(rotaEncerrarAmbiente[1]);
    ambiente.processos.forEach(encerrar);
    return comStatus(ambiente);
  }

  //encerra um processo só
  if (rotaEncerrarProcesso && metodo === "POST") {
    const ambiente = acharAmbiente(rotaEncerrarProcesso[1]);
    encerrar(acharProcesso(ambiente, rotaEncerrarProcesso[2]));
    return comStatus(ambiente);
  }

  //log de um processo
  if (rotaLog && metodo === "GET") {
    const ambiente = acharAmbiente(rotaLog[1]);
    return logDe(acharProcesso(ambiente, rotaLog[2]));
  }

  return erro(`Rota não encontrada: ${metodo} ${caminho}`);
}