import path from "node:path";

//pasta onde o back guarda os arquivos no disco (scripts e, depois, logs)
//na VM vem da variável LEM_DADOS (ex.: /var/lib/lem); no PC usa a pasta "dados" do projeto
export function pastaDados(): string {
  const daVariavel = process.env.LEM_DADOS;

  if (daVariavel) {
    return daVariavel;
  }

  return path.join(process.cwd(), "dados");
}

//pasta dos scripts enviados
export function pastaScripts(): string {
  return path.join(pastaDados(), "scripts");
}

//caminho do arquivo de um script no disco: <pasta>/<id><extensão>
//o arquivo se chama pelo id (e não pelo nome que o usuário deu), então o nome digitado nunca vira caminho: não há conflito nem como escapar da pasta com "../"
export function arquivoDoScript(id: string, extensao: string): string {
  return path.join(pastaScripts(), `${id}${extensao}`);
}

//pasta de um ambiente: <pasta de dados>/ambientes/<nome>
//fica dentro de "ambientes" para um ambiente chamado "scripts" não esbarrar na pasta dos scripts
export function pastaDoAmbiente(nome: string): string {
  return path.join(pastaDados(), "ambientes", nome);
}

//pasta dos logs de um ambiente
export function pastaDeLogs(nome: string): string {
  return path.join(pastaDoAmbiente(nome), "logs");
}

//arquivo de log de um processo: um arquivo por execução (o id é do processo, não do script)
export function arquivoDeLog(nome: string, idProcesso: string): string {
  return path.join(pastaDeLogs(nome), `${idProcesso}.log`);
}