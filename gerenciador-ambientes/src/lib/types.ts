//formatos dos dados usados pelo front e pelo back só descrevem os campos (o TypeScript usa isso para achar erros antes de rodar), os valores vêm do formulário, do banco e do Linux

//os três status possíveis, o back decide qual usar a partir do que o Linux informa
export type Status = "executando" | "terminado" | "erro";

//um script rodando (ou que já rodou) dentro de um ambiente
export interface Processo {
  id: string;
  comando: string; //como foi executado, ex.: python3 -u scripts/monitor.py
  pid: number;
  status: Status;
  iniciadoEm: string;
  finalizadoEm?: string; //o "?" significa opcional: só existe depois que o processo termina
  codigoSaida?: number; //só existe depois que o processo termina (0 = sucesso)
}

//um ambiente isolado (namespace + cgroup) com seus processos
export interface Ambiente {
  id: string;
  nome: string;
  //nome do namespace/cgroup que será criado na VM
  namespace: string;
  //núcleos de CPU (cpu.max)
  cpu: number;
  //limite de memória em MB (memory.max)
  memoriaMb: number;
  //limite de IO em MB/s (io.max)
  ioMbps: number;
  processos: Processo[];
  criadoEm: string;
}

//Ambiente com o status agregado, como a API o devolve
//"extends" = tudo que o Ambiente tem, mais o campo status (calculado a partir dos processos)
export interface AmbienteView extends Ambiente {
  status: Status;
}

//script (.sh ou .py) enviado pelo formulário e guardado para reuso
export interface Script {
  id: string;
  nome: string;
  tamanhoBytes: number;
  criadoEm: string;
  conteudo: string; //o texto do arquivo
}

//script sem o conteúdo (Omit = "tudo menos"), para listar sem carregar o arquivo inteiro
export type ScriptResumo = Omit<Script, "conteudo">;

//o que o formulário de novo ambiente envia para a API
export interface NovoAmbiente {
  nome: string;
  cpu: number;
  memoriaMb: number;
  ioMbps: number;
  //ids dos scripts salvos a executar; cada um vira um processo
  scriptIds: string[];
}

//resposta da rota de log: as últimas linhas e o status do processo
export interface LogResposta {
  linhas: string[];
  status: Status;
}