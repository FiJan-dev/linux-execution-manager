import type { Status } from "@/lib/types";

//só o que a função precisa saber de cada processo: o status dele
interface ProcessoComStatus {
  status: Status;
}

//calcula o status do ambiente a partir dos status dos processos dele
//o status do ambiente não é guardado no banco: sempre sai desta conta
export function statusDoAmbiente(processos: ProcessoComStatus[]): Status {
  //some devolve true se pelo menos um processo da lista passa no teste
  const algumRodando = processos.some((p) => p.status === "executando");

  //enquanto algum processo roda, o ambiente está em execução
  if (algumRodando) {
    return "executando";
  }

  const algumComErro = processos.some((p) => p.status === "erro");

  //nenhum roda, mas algum terminou com erro: o ambiente é de erro
  if (algumComErro) {
    return "erro";
  }

  //nenhum roda e nenhum deu erro (inclui o ambiente sem processos): terminado
  return "terminado";
}